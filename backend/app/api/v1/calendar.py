import uuid
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile
from icalendar import Calendar, Event
from pydantic import BaseModel
from sqlalchemy import and_, or_, select

from app.core.deps import DB, CurrentUser, ensure_refs_owned, get_owned
from app.core.time import utcnow
from app.models import CalendarEvent, Goal, Habit, Project, Reminder, Task
from app.schemas import EventCreate, EventOccurrence, EventRead, EventUpdate
from app.services.recurrence import occurrences, validate_rrule

router = APIRouter(prefix="/calendar", tags=["calendar"])


def _refs(db, user, data):
    ensure_refs_owned(db, user, {Task: data.get("task_id"), Goal: data.get("goal_id"),
                                 Habit: data.get("habit_id"), Project: data.get("project_id")})


def _sync_reminders(db, user, ev: CalendarEvent, minutes: list[int]):
    """Event reminders live in the generic reminders table (entity_type='event')."""
    old = db.scalars(select(Reminder).where(Reminder.user_id == user.id, Reminder.entity_type == "event",
                                            Reminder.entity_id == ev.id)).all()
    for r in old:
        db.delete(r)
    now = utcnow()
    for m in dict.fromkeys(minutes):
        fire = ev.starts_at - timedelta(minutes=m)
        if not ev.recurrence_rule and fire < now:
            continue
        r = Reminder(user_id=user.id, kind="event", title=ev.title,
                     body=f"Начало в {ev.starts_at.isoformat()}" if m else "Событие начинается",
                     entity_type="event", entity_id=ev.id, channels=["in_app", "browser", "web_push"],
                     first_fire_at=fire, recurrence_rule=ev.recurrence_rule, timezone=ev.timezone)
        from app.services.reminders import compute_initial_next

        r.next_fire_at = compute_initial_next(r, now)
        r.is_active = r.next_fire_at is not None
        db.add(r)


@router.get("/events", response_model=list[EventOccurrence])
def range_events(db: DB, user: CurrentUser, start: datetime = Query(...), end: datetime = Query(...),
                 category: str | None = None):
    """All occurrences overlapping [start, end) — recurring events expanded in their own time zone."""
    if start.tzinfo is None or end.tzinfo is None:
        raise HTTPException(422, "start/end должны содержать часовой пояс")
    if end <= start or end - start > timedelta(days=400):
        raise HTTPException(422, "Диапазон 1..400 дней")
    stmt = select(CalendarEvent).where(
        CalendarEvent.user_id == user.id, CalendarEvent.deleted_at.is_(None),
        or_(and_(CalendarEvent.recurrence_rule.is_(None), CalendarEvent.starts_at < end,
                 CalendarEvent.ends_at > start),
            and_(CalendarEvent.recurrence_rule.is_not(None), CalendarEvent.starts_at < end)))
    if category:
        stmt = stmt.where(CalendarEvent.category == category)
    out = []
    for ev in db.scalars(stmt):
        dur = ev.ends_at - ev.starts_at
        starts = (occurrences(ev.recurrence_rule, ev.starts_at, ev.timezone, start - dur, end)
                  if ev.recurrence_rule else [ev.starts_at])
        done_set = set(ev.done_occurrences or [])
        for s in starts:
            if s < end and s + dur > start:
                done = (_occ_key(s) in done_set) if ev.recurrence_rule else ev.completed_at is not None
                out.append(EventOccurrence(event_id=ev.id, title=ev.title, starts_at=s, ends_at=s + dur,
                                           all_day=ev.all_day, color=ev.color, category=ev.category,
                                           is_recurring=bool(ev.recurrence_rule), is_time_block=ev.is_time_block,
                                           task_id=ev.task_id, goal_id=ev.goal_id, habit_id=ev.habit_id,
                                           project_id=ev.project_id, done=done, external_source=ev.external_source))
    out.sort(key=lambda o: o.starts_at)
    return out


def _occ_key(s: datetime) -> str:
    return s.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class CompleteIn(BaseModel):
    done: bool = True
    occurrence_start: datetime | None = None  # required for recurring events


@router.post("/events/{event_id}/complete", response_model=EventRead)
def complete_event(event_id: uuid.UUID, payload: CompleteIn, db: DB, user: CurrentUser):
    """Mark an event (or one occurrence of a recurring event) as done. Gives XP once per occurrence;
    the linked task, if any, is completed too."""
    from app.services import gamification as gm

    ev = get_owned(db, CalendarEvent, event_id, user)
    if ev.recurrence_rule:
        if not payload.occurrence_start or payload.occurrence_start.tzinfo is None:
            raise HTTPException(422, "Для повторяющегося события укажите occurrence_start с часовым поясом")
        key = _occ_key(payload.occurrence_start)
        done = set(ev.done_occurrences or [])
        (done.add if payload.done else done.discard)(key)
        ev.done_occurrences = sorted(done)
    else:
        key = "single"
        ev.completed_at = utcnow() if payload.done else None
    xp_key = f"event_done:{ev.id}:{key}"
    if payload.done:
        gm.award(db, user, "event_done", "event", ev.id, key=xp_key)
        if ev.task_id and not ev.recurrence_rule:
            from app.api.v1.tasks import _on_status_change

            t = db.get(Task, ev.task_id)
            if t and t.user_id == user.id and t.status != "done":
                old, t.status = t.status, "done"
                _on_status_change(db, user, t, old)
    else:
        gm.revoke(db, user, "event_done", "event", ev.id, key=xp_key)
    db.commit()
    return EventRead.model_validate(ev)


@router.post("/events", response_model=EventRead, status_code=201)
def create_event(payload: EventCreate, db: DB, user: CurrentUser):
    data = payload.model_dump()
    minutes = data.pop("reminder_minutes_before")
    if data["ends_at"] <= data["starts_at"]:
        raise HTTPException(422, "Окончание должно быть позже начала")
    _refs(db, user, data)
    ev = CalendarEvent(**data, user_id=user.id)
    db.add(ev)
    db.flush()
    _sync_reminders(db, user, ev, minutes)
    db.commit()
    return EventRead.model_validate(ev)


@router.get("/events/{event_id}", response_model=EventRead)
def get_event(event_id: uuid.UUID, db: DB, user: CurrentUser):
    return get_owned(db, CalendarEvent, event_id, user)


@router.get("/events/{event_id}/reminders")
def event_reminders(event_id: uuid.UUID, db: DB, user: CurrentUser):
    ev = get_owned(db, CalendarEvent, event_id, user)
    rows = db.scalars(select(Reminder).where(Reminder.user_id == user.id, Reminder.entity_type == "event",
                                             Reminder.entity_id == ev.id))
    return [int((ev.starts_at - r.first_fire_at).total_seconds() // 60) for r in rows]


@router.patch("/events/{event_id}", response_model=EventRead)
def update_event(event_id: uuid.UUID, payload: EventUpdate, db: DB, user: CurrentUser):
    ev = get_owned(db, CalendarEvent, event_id, user)
    data = payload.model_dump(exclude_unset=True)
    minutes = data.pop("reminder_minutes_before", None)
    _refs(db, user, data)
    for k, v in data.items():
        setattr(ev, k, v)
    if ev.ends_at <= ev.starts_at:
        raise HTTPException(422, "Окончание должно быть позже начала")
    if minutes is not None or {"starts_at", "recurrence_rule", "title"} & data.keys():
        if minutes is None:
            minutes = event_reminders(event_id, db, user)
        _sync_reminders(db, user, ev, minutes)
    db.commit()
    return EventRead.model_validate(ev)


@router.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: uuid.UUID, db: DB, user: CurrentUser):
    ev = get_owned(db, CalendarEvent, event_id, user)
    ev.deleted_at = utcnow()
    _sync_reminders(db, user, ev, [])
    db.commit()
    return Response(status_code=204)


@router.get("/export.ics")
def export_ics(db: DB, user: CurrentUser):
    cal = Calendar()
    cal.add("prodid", "-//LIFE OS//lifeos//RU")
    cal.add("version", "2.0")
    for ev in db.scalars(select(CalendarEvent).where(CalendarEvent.user_id == user.id,
                                                     CalendarEvent.deleted_at.is_(None))):
        e = Event()
        e.add("uid", ev.external_uid or f"{ev.id}@lifeos")
        e.add("summary", ev.title)
        e.add("description", ev.description)
        e.add("location", ev.location)
        if ev.all_day:
            e.add("dtstart", ev.starts_at.date())
            e.add("dtend", ev.ends_at.date())
        else:
            e.add("dtstart", ev.starts_at)
            e.add("dtend", ev.ends_at)
        if ev.recurrence_rule:
            from icalendar import vRecur

            e.add("rrule", vRecur.from_ical(ev.recurrence_rule))
        e.add("dtstamp", ev.updated_at)
        cal.add_component(e)
    return Response(cal.to_ical(), media_type="text/calendar",
                    headers={"Content-Disposition": 'attachment; filename="lifeos.ics"'})


@router.post("/import.ics")
async def import_ics(db: DB, user: CurrentUser, file: UploadFile = File(...)):
    raw = await file.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(413, "Файл больше 5 МБ")
    try:
        cal = Calendar.from_ical(raw)
    except Exception:  # noqa: BLE001
        raise HTTPException(422, "Некорректный ICS-файл") from None
    created = updated = skipped = 0
    for comp in cal.walk("VEVENT"):
        try:
            uid = str(comp.get("uid") or uuid.uuid4())
            ds = comp.decoded("dtstart")
            de = comp.decoded("dtend") if comp.get("dtend") else None
            all_day = isinstance(ds, date) and not isinstance(ds, datetime)
            if all_day:
                ds = datetime(ds.year, ds.month, ds.day, tzinfo=UTC)
                de = datetime(de.year, de.month, de.day, tzinfo=UTC) if de else ds + timedelta(days=1)
            else:
                if ds.tzinfo is None:
                    ds = ds.replace(tzinfo=UTC)
                de = de or ds + timedelta(hours=1)
                if de.tzinfo is None:
                    de = de.replace(tzinfo=UTC)
            tzname = getattr(comp.get("dtstart").dt.tzinfo, "key", None) or "UTC"
            rrule = comp.get("rrule")
            rule = validate_rrule(rrule.to_ical().decode()) if rrule else None
            existing = db.scalar(select(CalendarEvent).where(CalendarEvent.user_id == user.id,
                                                             CalendarEvent.external_uid == uid))
            vals = dict(title=str(comp.get("summary") or "Без названия")[:200],
                        description=str(comp.get("description") or ""), location=str(comp.get("location") or "")[:200],
                        starts_at=ds, ends_at=de if de > ds else ds + timedelta(hours=1), all_day=all_day,
                        timezone=tzname, recurrence_rule=rule, external_source="ics", external_uid=uid)
            if existing:
                for k, v in vals.items():
                    setattr(existing, k, v)
                existing.deleted_at = None
                updated += 1
            else:
                db.add(CalendarEvent(user_id=user.id, **vals))
                created += 1
        except Exception:  # noqa: BLE001
            skipped += 1
    db.commit()
    return {"created": created, "updated": updated, "skipped": skipped}
