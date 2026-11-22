import uuid
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import select

from app.core.deps import DB, CurrentUser, ensure_refs_owned, get_owned
from app.core.time import local_today, utcnow
from app.models import Goal, Habit, HabitLog, Reminder
from app.schemas import HabitCheckIn, HabitCreate, HabitLogRead, HabitRead, HabitUpdate
from app.services import gamification as gm
from app.services.activity import log_event
from app.services.habits import compute_stats, is_scheduled_day

router = APIRouter(prefix="/habits", tags=["habits"])


def _read(db, user, h: Habit, today: date) -> HabitRead:
    r = HabitRead.model_validate(h)
    lg = db.scalar(select(HabitLog).where(HabitLog.habit_id == h.id, HabitLog.log_date == today))
    r.today_value = lg.value if lg else 0
    r.today_status = lg.status if lg else None
    r.scheduled_today = is_scheduled_day(h, today)
    logs = db.scalars(select(HabitLog).where(HabitLog.habit_id == h.id)).all()
    r.current_streak = compute_stats(h, logs, today)["current_streak"]
    return r


def _sync_reminder(db, user, h: Habit):
    """habit.reminder_time -> a recurring backend reminder in the user's time zone (selected weekdays respected)."""
    from datetime import datetime as dt

    from app.core.time import user_tz
    from app.services.reminders import compute_initial_next

    for r in db.scalars(select(Reminder).where(Reminder.user_id == user.id, Reminder.entity_type == "habit",
                                               Reminder.entity_id == h.id)):
        db.delete(r)
    if not h.reminder_time or not h.is_active or h.deleted_at:
        return
    hh, mm = map(int, h.reminder_time.split(":"))
    tz = user_tz(user)
    first = dt(h.start_date.year, h.start_date.month, h.start_date.day, hh, mm, tzinfo=tz)
    rule = "FREQ=DAILY"
    if h.frequency == "selected_days" and (h.schedule or {}).get("weekdays"):
        rule = "FREQ=WEEKLY;BYDAY=" + ",".join(["MO", "TU", "WE", "TH", "FR", "SA", "SU"][d] for d in h.schedule["weekdays"])
    elif h.frequency == "custom":
        rule = f"FREQ=DAILY;INTERVAL={max(1, int((h.schedule or {}).get('interval_days', 1)))}"
    if h.end_date:
        rule += f";UNTIL={h.end_date.strftime('%Y%m%d')}T235959Z"
    r = Reminder(user_id=user.id, kind="habit", title=f"Привычка: {h.title}", entity_type="habit", entity_id=h.id,
                 channels=["in_app", "browser", "web_push"], first_fire_at=first, recurrence_rule=rule,
                 timezone=user.profile.timezone)
    r.next_fire_at = compute_initial_next(r, utcnow())
    r.is_active = r.next_fire_at is not None
    db.add(r)


@router.get("", response_model=list[HabitRead])
def list_habits(db: DB, user: CurrentUser, active: bool | None = None, category: str | None = None):
    stmt = select(Habit).where(Habit.user_id == user.id, Habit.deleted_at.is_(None))
    if active is not None:
        stmt = stmt.where(Habit.is_active.is_(active))
    if category:
        stmt = stmt.where(Habit.category == category)
    today = local_today(user)
    return [_read(db, user, h, today) for h in db.scalars(stmt.order_by(Habit.created_at))]


@router.post("", response_model=HabitRead, status_code=201)
def create_habit(payload: HabitCreate, db: DB, user: CurrentUser):
    data = payload.model_dump()
    ensure_refs_owned(db, user, {Goal: data.get("goal_id")})
    data["start_date"] = data["start_date"] or local_today(user)
    if data["kind"] == "boolean":
        data["target"] = 1
    _validate(data)
    h = Habit(**data, user_id=user.id)
    db.add(h)
    db.flush()
    _sync_reminder(db, user, h)
    db.commit()
    return _read(db, user, h, local_today(user))


def _validate(data):
    if data.get("end_date") and data.get("start_date") and data["end_date"] < data["start_date"]:
        raise HTTPException(422, "Дата окончания раньше даты начала")
    if data.get("frequency") == "selected_days" and not (data.get("schedule") or {}).get("weekdays"):
        raise HTTPException(422, "Выберите дни недели")


@router.get("/{habit_id}", response_model=HabitRead)
def get_habit(habit_id: uuid.UUID, db: DB, user: CurrentUser):
    return _read(db, user, get_owned(db, Habit, habit_id, user), local_today(user))


@router.patch("/{habit_id}", response_model=HabitRead)
def update_habit(habit_id: uuid.UUID, payload: HabitUpdate, db: DB, user: CurrentUser):
    h = get_owned(db, Habit, habit_id, user)
    data = payload.model_dump(exclude_unset=True)
    ensure_refs_owned(db, user, {Goal: data.get("goal_id")})
    for k, v in data.items():
        setattr(h, k, v)
    _validate({"start_date": h.start_date, "end_date": h.end_date, "frequency": h.frequency, "schedule": h.schedule})
    _sync_reminder(db, user, h)
    db.commit()
    return _read(db, user, h, local_today(user))


@router.delete("/{habit_id}", status_code=204)
def delete_habit(habit_id: uuid.UUID, db: DB, user: CurrentUser):
    h = get_owned(db, Habit, habit_id, user)
    h.deleted_at = utcnow()
    _sync_reminder(db, user, h)
    db.commit()
    return Response(status_code=204)


@router.post("/{habit_id}/check", response_model=HabitLogRead)
def check(habit_id: uuid.UUID, payload: HabitCheckIn, db: DB, user: CurrentUser):
    """Mark a day. Boolean habits: one completion per day (repeat calls are idempotent).
    Numeric/duration: value is added to the day's total only if allow_multiple_per_day, else replaced."""
    h = get_owned(db, Habit, habit_id, user)
    today = local_today(user)
    d = payload.log_date or today
    if d > today:
        raise HTTPException(422, "Нельзя отметить будущую дату")
    if d < h.start_date:
        raise HTTPException(422, "Дата раньше начала привычки")
    lg = db.scalar(select(HabitLog).where(HabitLog.habit_id == h.id, HabitLog.log_date == d).with_for_update())
    value = 1.0 if h.kind == "boolean" else (payload.value if payload.value is not None else h.target)
    if lg is None:
        lg = HabitLog(user_id=user.id, habit_id=h.id, log_date=d, value=value if payload.status == "done" else 0,
                      status=payload.status, note=payload.note)
        db.add(lg)
    else:
        if payload.status == "skipped":
            lg.status, lg.value = "skipped", 0
        elif h.kind != "boolean" and h.allow_multiple_per_day and lg.status == "done":
            lg.value += value
        else:
            lg.value, lg.status = value, "done"
        if payload.note:
            lg.note = payload.note
    target = 1 if h.kind == "boolean" else h.target
    db.flush()
    key = f"habit_check:{h.id}:{d.isoformat()}"
    if lg.status == "done" and lg.value >= target:
        gm.award(db, user, "habit_check", "habit", h.id, key=key)
        log_event(db, user.id, "habit_done", "habit", h.id, {"date": d.isoformat()})
    else:
        gm.revoke(db, user, "habit_check", "habit", h.id, key=key)
    db.commit()
    return HabitLogRead.model_validate(lg)


@router.delete("/{habit_id}/check", status_code=204)
def uncheck(habit_id: uuid.UUID, db: DB, user: CurrentUser, log_date: date | None = None):
    h = get_owned(db, Habit, habit_id, user)
    d = log_date or local_today(user)
    lg = db.scalar(select(HabitLog).where(HabitLog.habit_id == h.id, HabitLog.log_date == d))
    if lg:
        db.delete(lg)
        gm.revoke(db, user, "habit_check", "habit", h.id, key=f"habit_check:{h.id}:{d.isoformat()}")
        db.commit()
    return Response(status_code=204)


@router.get("/{habit_id}/stats")
def stats(habit_id: uuid.UUID, db: DB, user: CurrentUser):
    h = get_owned(db, Habit, habit_id, user)
    logs = db.scalars(select(HabitLog).where(HabitLog.habit_id == h.id)).all()
    return compute_stats(h, logs, local_today(user))


@router.get("/{habit_id}/logs", response_model=list[HabitLogRead])
def logs(habit_id: uuid.UUID, db: DB, user: CurrentUser, days: int = Query(365, ge=1, le=3660)):
    h = get_owned(db, Habit, habit_id, user)
    since = local_today(user) - timedelta(days=days - 1)
    return db.scalars(select(HabitLog).where(HabitLog.habit_id == h.id, HabitLog.log_date >= since)
                      .order_by(HabitLog.log_date)).all()


@router.get("/{habit_id}/heatmap")
def heatmap(habit_id: uuid.UUID, db: DB, user: CurrentUser, days: int = Query(365, ge=7, le=730)):
    h = get_owned(db, Habit, habit_id, user)
    today = local_today(user)
    since = today - timedelta(days=days - 1)
    by_day = {lg.log_date: lg for lg in db.scalars(select(HabitLog).where(HabitLog.habit_id == h.id,
                                                                          HabitLog.log_date >= since))}
    target = 1 if h.kind == "boolean" else h.target
    out = []
    for i in range(days):
        d = since + timedelta(days=i)
        lg = by_day.get(d)
        level = 0 if not lg or lg.status != "done" else min(4, max(1, int(lg.value / target * 4)))
        out.append({"date": d.isoformat(), "value": lg.value if lg else 0, "status": lg.status if lg else None,
                    "scheduled": is_scheduled_day(h, d), "level": level})
    return out
