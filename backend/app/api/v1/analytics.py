"""/analytics, /dashboard, /gamification, /achievements, /search."""
import csv
import io
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from app.core.deps import DB, CurrentUser
from app.core.time import local_today, user_tz
from app.models import (Achievement, Book, CalendarEvent, Course, Goal, Habit, JournalEntry, Note, Task,
                        UserAchievement, XPTransaction)
from app.services import gamification as gm
from app.services.analytics import activity_streak, compute

analytics = APIRouter(prefix="/analytics", tags=["analytics"])


def _period(user, period: str, start: date | None, end: date | None):
    today = local_today(user)
    if start and end:
        if end < start or (end - start).days > 731:
            raise HTTPException(422, "Некорректный период (максимум 2 года)")
        return start, end
    if period == "day":
        return today, today
    if period == "week":
        return today - timedelta(days=today.weekday()), today
    if period == "month":
        return today.replace(day=1), today
    if period == "year":
        return today.replace(month=1, day=1), today
    return today - timedelta(days=29), today  # last30


@analytics.get("/overview")
def overview(db: DB, user: CurrentUser, period: str = Query("last30", pattern="^(day|week|month|year|last30)$"),
             start: date | None = None, end: date | None = None, category: str | None = None,
             compare: bool = True):
    s, e = _period(user, period, start, end)
    cur = compute(db, user, s, e, category)
    if compare:
        length = (e - s).days + 1
        ps, pe = s - timedelta(days=length), s - timedelta(days=1)
        prev = compute(db, user, ps, pe, category)
        prev.pop("series", None)
        cur["previous"] = prev
    return cur


@analytics.get("/export.csv")
def export_csv(db: DB, user: CurrentUser, period: str = Query("last30", pattern="^(day|week|month|year|last30)$"),
               start: date | None = None, end: date | None = None):
    s, e = _period(user, period, start, end)
    data = compute(db, user, s, e)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=["date", "tasks_done", "habit_checks", "focus_minutes", "learning_minutes"])
    w.writeheader()
    w.writerows(data["series"])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="analytics-{s}-{e}.csv"'})


@analytics.get("/formulas")
def formulas():
    from app.services import analytics as a

    return {"doc": a.__doc__}


# ================================================================ Dashboard
dashboard = APIRouter(prefix="/dashboard", tags=["dashboard"])

QUOTES = [
    ("Мы есть то, что мы делаем постоянно. Совершенство — не действие, а привычка.", "Аристотель (в пересказе)"),
    ("Путь в тысячу ли начинается с первого шага.", "Лао-цзы"),
    ("Познай самого себя.", "Дельфийская максима"),
    ("Кто хочет — ищет возможности, кто не хочет — ищет причины.", "Сократ (приписывается)"),
    ("Не тот велик, кто никогда не падал, а тот велик, кто падал и вставал.", "Конфуций (приписывается)"),
    ("Тише едешь — дальше будешь.", "Русская пословица"),
    ("Білім — таусылмас қазына.", "Казахская пословица"),
]


def _recommendations(db, user, ctx: dict) -> list[dict]:
    """Rule-based recommendations derived from the user's real data (not LLM-generated)."""
    rec = []
    if ctx["overdue"]:
        rec.append({"kind": "tasks", "text": f"Просрочено задач: {ctx['overdue']}. Перенесите или завершите их.",
                    "link": "/tasks?view=overdue"})
    pending = [h for h in ctx["habits"] if h["scheduled_today"] and h["today_status"] != "done"]
    if pending:
        rec.append({"kind": "habits", "text": f"Осталось привычек на сегодня: {len(pending)}.", "link": "/habits"})
    if ctx["focus_today"] == 0:
        rec.append({"kind": "focus", "text": "Сегодня ещё не было фокус-сессий — запустите 25 минут.",
                    "link": "/focus"})
    if ctx["cards_due"]:
        rec.append({"kind": "flashcards", "text": f"Карточек к повторению: {ctx['cards_due']}.",
                    "link": "/flashcards"})
    stale = [g for g in ctx["goals"] if g["deadline"] and g["progress"] < 50 and
             date.fromisoformat(g["deadline"]) - local_today(user) < timedelta(days=14)]
    for g in stale[:2]:
        rec.append({"kind": "goals", "text": f"Цель «{g['title']}» близка к дедлайну, прогресс {g['progress']}%.",
                    "link": f"/goals/{g['id']}"})
    return rec


@dashboard.get("")
def get_dashboard(db: DB, user: CurrentUser):
    from app.api.v1.goals import goal_read
    from app.api.v1.habits import _read as habit_read
    from app.api.v1.learning import learning_dashboard
    from app.api.v1.life import focus_stats
    from app.api.v1.tasks import _reads
    from app.models import Flashcard
    from datetime import datetime, time

    tz = user_tz(user)
    today = local_today(user)
    day_start = datetime.combine(today, time.min, tz)
    day_end = day_start + timedelta(days=1)
    open_ = Task.status.notin_(("done", "cancelled"))
    base = select(Task).where(Task.user_id == user.id, Task.deleted_at.is_(None), Task.is_template.is_(False),
                              Task.archived.is_(False), Task.parent_id.is_(None))
    today_tasks = db.scalars(base.where(open_, Task.due_at < day_end).order_by(Task.priority, Task.due_at)).all()
    done_today = db.scalar(select(func.count()).select_from(Task).where(
        Task.user_id == user.id, Task.completed_at >= day_start, Task.completed_at < day_end)) or 0
    priorities_ids = (user.settings.dashboard_layout or {}).get("priorities", {}).get(today.isoformat(), [])
    if priorities_ids:
        prio = db.scalars(base.where(Task.id.in_(priorities_ids))).all()
    else:
        prio = db.scalars(base.where(open_).order_by(Task.priority, Task.due_at.asc().nulls_last()).limit(3)).all()
    overdue = db.scalar(select(func.count()).select_from(base.where(open_, Task.due_at < day_start).subquery())) or 0
    habits = [habit_read(db, user, h, today).model_dump(mode="json") for h in db.scalars(
        select(Habit).where(Habit.user_id == user.id, Habit.deleted_at.is_(None), Habit.is_active.is_(True)))]
    from app.api.v1.calendar import range_events

    events = [e.model_dump(mode="json") for e in range_events(db, user, start=day_start,
                                                              end=day_start + timedelta(days=7))][:10]
    goals = [goal_read(db, g).model_dump(mode="json") for g in db.scalars(
        select(Goal).where(Goal.user_id == user.id, Goal.deleted_at.is_(None), Goal.status == "active")
        .order_by(Goal.priority, Goal.deadline.asc().nulls_last()).limit(5))]
    xp = gm.total_xp(db, user.id)
    lvl = gm.level_for_xp(xp)
    fs = focus_stats(db, user)
    ld = learning_dashboard(db, user)
    cards_due = db.scalar(select(func.count()).select_from(Flashcard).where(
        Flashcard.user_id == user.id, Flashcard.due_date <= today)) or 0
    week = compute(db, user, today - timedelta(days=6), today)
    month = compute(db, user, today.replace(day=1), today)
    day = compute(db, user, today, today)
    habits_done = sum(1 for h in habits if h["today_status"] == "done")
    habits_sched = sum(1 for h in habits if h["scheduled_today"])
    quote = QUOTES[today.toordinal() % len(QUOTES)]
    ctx = {"overdue": overdue, "habits": habits, "focus_today": fs["today_minutes"], "cards_due": cards_due,
           "goals": goals}
    return {
        "user": {"name": user.profile.name, "language": user.profile.language},
        "date": today.isoformat(),
        "layout": user.settings.dashboard_layout,
        "today_tasks": [t.model_dump(mode="json") for t in _reads(db, user, list(today_tasks))],
        "priorities": [t.model_dump(mode="json") for t in _reads(db, user, list(prio))],
        "overdue_count": overdue,
        "habits": habits,
        "events": events,
        "goals": goals,
        "learning": {"minutes_today": ld["minutes_today"], "minutes_week": ld["minutes_week"],
                     "active_courses": [c.model_dump(mode="json") for c in ld["active_courses"][:4]]},
        "focus": fs,
        "cards_due": cards_due,
        "stats": {
            "daily_progress": day["productivity_score"], "weekly_progress": week["productivity_score"],
            "monthly_progress": month["productivity_score"], "tasks_done_today": done_today,
            "habits_done_today": habits_done, "habits_scheduled_today": habits_sched,
            "learning_minutes_today": ld["minutes_today"], "focus_minutes_today": fs["today_minutes"],
            "current_streak": activity_streak(db, user, today), "xp": xp, "level": lvl,
            "level_xp_start": gm.xp_for_level(lvl), "level_xp_next": gm.xp_for_level(lvl + 1),
        },
        "weekly": week["series"],
        "quote": {"text": quote[0], "author": quote[1]},
        "recommendations": _recommendations(db, user, ctx),
    }


class LayoutIn(BaseModel):
    widgets: list[dict] = Field(max_length=50)


@dashboard.put("/layout")
def save_layout(payload: LayoutIn, db: DB, user: CurrentUser):
    allowed = {"today_tasks", "priorities", "habits", "events", "goals", "learning", "focus", "stats", "weekly",
               "quote", "ai"}
    widgets = []
    for w in payload.widgets:
        if w.get("id") in allowed and w["id"] not in {x["id"] for x in widgets}:
            widgets.append({"id": w["id"], "visible": bool(w.get("visible", True))})
    layout = dict(user.settings.dashboard_layout or {})
    layout["widgets"] = widgets
    user.settings.dashboard_layout = layout
    db.commit()
    return layout


class StartDayIn(BaseModel):
    priority_task_ids: list = Field(default_factory=list, max_length=3)
    intention: str = Field("", max_length=2000)


@dashboard.post("/start-day")
def start_day(payload: StartDayIn, db: DB, user: CurrentUser):
    """Saves today's Top-3 priorities and an optional morning journal entry."""
    import uuid as _uuid

    from app.core.deps import get_owned

    today = local_today(user)
    ids = []
    for raw in payload.priority_task_ids:
        tid = _uuid.UUID(str(raw))
        get_owned(db, Task, tid, user)
        ids.append(str(tid))
    layout = dict(user.settings.dashboard_layout or {})
    pr = dict(layout.get("priorities", {}))
    pr = {k: v for k, v in pr.items() if k >= (today - timedelta(days=7)).isoformat()}
    pr[today.isoformat()] = ids
    layout["priorities"] = pr
    user.settings.dashboard_layout = layout
    entry_id = None
    if payload.intention.strip():
        e = JournalEntry(user_id=user.id, kind="morning", title="Начало дня", body=payload.intention,
                         entry_date=today)
        db.add(e)
        db.flush()
        entry_id = str(e.id)
        gm.award(db, user, "journal_entry", "journal", e.id, key=f"journal_entry:{today.isoformat()}:morning")
    db.commit()
    return {"priorities": ids, "journal_entry_id": entry_id}


class EndDayIn(BaseModel):
    reflection: str = Field("", max_length=5000)
    mood: int | None = Field(None, ge=1, le=10)


@dashboard.post("/end-day")
def end_day(payload: EndDayIn, db: DB, user: CurrentUser):
    today = local_today(user)
    summary = compute(db, user, today, today)
    entry_id = None
    if payload.reflection.strip() or payload.mood:
        body = (f"{payload.reflection}\n\n---\nЗадач выполнено: {summary['tasks_done']}; "
                f"привычек: {summary['habit_days_done']}/{summary['habit_days_evaluated']}; "
                f"фокус: {round(summary['focus_hours'] * 60)} мин.")
        e = JournalEntry(user_id=user.id, kind="evening", title="Итоги дня", body=body, entry_date=today,
                         mood=payload.mood)
        db.add(e)
        db.flush()
        entry_id = str(e.id)
        gm.award(db, user, "journal_entry", "journal", e.id, key=f"journal_entry:{today.isoformat()}:evening")
    db.commit()
    summary.pop("series", None)
    return {"summary": summary, "journal_entry_id": entry_id}


@dashboard.get("/search")
def global_search(db: DB, user: CurrentUser, q: str = Query(..., min_length=1, max_length=100)):
    like = f"%{q}%"
    out = []
    specs = [(Task, "task", Task.title, "/tasks"), (Goal, "goal", Goal.title, "/goals"),
             (Habit, "habit", Habit.title, "/habits"), (Note, "note", Note.title, "/notes"),
             (Book, "book", Book.title, "/books"), (Course, "course", Course.title, "/learning"),
             (CalendarEvent, "event", CalendarEvent.title, "/calendar")]
    for model, typ, col, link in specs:
        stmt = select(model).where(model.user_id == user.id, col.ilike(like))
        if hasattr(model, "deleted_at"):
            stmt = stmt.where(model.deleted_at.is_(None))
        for o in db.scalars(stmt.limit(8)):
            out.append({"type": typ, "id": str(o.id), "title": o.title,
                        "link": f"{link}/{o.id}" if typ in ("goal", "note") else link})
    j = db.scalars(select(JournalEntry).where(JournalEntry.user_id == user.id, JournalEntry.deleted_at.is_(None),
                                              or_(JournalEntry.title.ilike(like), JournalEntry.body.ilike(like)))
                   .limit(5))
    out += [{"type": "journal", "id": str(e.id), "title": e.title or e.entry_date.isoformat(), "link": "/journal"}
            for e in j]
    return out


# ================================================================ Gamification
gamification = APIRouter(tags=["gamification"])


@gamification.get("/gamification/summary")
def summary(db: DB, user: CurrentUser):
    xp = gm.total_xp(db, user.id)
    lvl = gm.level_for_xp(xp)
    return {"xp": xp, "level": lvl, "level_xp_start": gm.xp_for_level(lvl), "level_xp_next": gm.xp_for_level(lvl + 1),
            "enabled": user.settings.gamification_enabled, "rules": gm.XP_RULES,
            "streak": activity_streak(db, user, local_today(user)),
            "records": {
                "tasks_done": gm.metric_value(db, user.id, "tasks_done"),
                "habit_checks": gm.metric_value(db, user.id, "habit_checks"),
                "focus_minutes": gm.metric_value(db, user.id, "focus_minutes"),
                "learning_minutes": gm.metric_value(db, user.id, "learning_minutes"),
                "books_completed": gm.metric_value(db, user.id, "books_completed")}}


@gamification.get("/gamification/xp-history")
def xp_history(db: DB, user: CurrentUser, limit: int = Query(100, ge=1, le=1000)):
    rows = db.scalars(select(XPTransaction).where(XPTransaction.user_id == user.id)
                      .order_by(XPTransaction.created_at.desc()).limit(limit))
    return [{"id": str(r.id), "amount": r.amount, "reason": r.reason, "source_type": r.source_type,
             "at": r.created_at.isoformat()} for r in rows]


@gamification.get("/achievements")
def achievements(db: DB, user: CurrentUser):
    unlocked = {ua.achievement_id: ua for ua in db.scalars(select(UserAchievement).where(
        UserAchievement.user_id == user.id))}
    out = []
    for a in db.scalars(select(Achievement).order_by(Achievement.xp_reward)):
        cond = a.condition or {}
        cur = gm.metric_value(db, user.id, cond.get("metric", ""))
        ua = unlocked.get(a.id)
        out.append({"id": str(a.id), "code": a.code, "title": a.title_ru, "title_en": a.title_en,
                    "description": a.description_ru, "icon": a.icon, "xp_reward": a.xp_reward,
                    "progress": min(cur, cond.get("gte", 1)), "target": cond.get("gte", 1),
                    "unlocked_at": ua.unlocked_at.isoformat() if ua else None,
                    "is_public": ua.is_public if ua else False})
    return out


@gamification.post("/achievements/{code}/visibility")
def achievement_visibility(code: str, payload: dict, db: DB, user: CurrentUser):
    a = db.scalar(select(Achievement).where(Achievement.code == code))
    ua = a and db.scalar(select(UserAchievement).where(UserAchievement.user_id == user.id,
                                                      UserAchievement.achievement_id == a.id))
    if not ua:
        raise HTTPException(404, "Достижение не получено")
    ua.is_public = bool(payload.get("is_public"))
    db.commit()
    return {"is_public": ua.is_public}


@gamification.post("/gamification/recheck")
def recheck(db: DB, user: CurrentUser):
    new = gm.check_achievements(db, user)
    db.commit()
    return {"unlocked": new}
