"""Streaks computed from real activity (nothing is stored except freezes).

* activity  — a day with at least one completed task, habit check or completed focus session.
* habits    — a day with at least one habit check.
* productive — a day with >= 3 completed tasks, or >= 60 focus minutes, or >= 30 learning minutes.
* weeks     — consecutive ISO weeks with >= 4 activity days ("successful weeks").

A streak ending yesterday is still "current" (today is not over yet). Days covered by a streak freeze
(StreakFreeze) count as activity days, so one missed day does not wipe out a long streak.
"""
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select

from app.core.time import local_today, user_tz
from app.models import FocusSession, HabitLog, LearningSession, StreakFreeze, Task

HISTORY_DAYS = 400
PRODUCTIVE = {"tasks": 3, "focus_minutes": 60, "learning_minutes": 30}


def _bounds(user, since: date):
    from datetime import datetime, time

    return datetime.combine(since, time.min, user_tz(user))


def day_sets(db, user, since: date | None = None) -> dict[str, set[date]]:
    """{"activity", "habits", "productive", "frozen"} -> set of local dates since `since`."""
    tz = user_tz(user)
    since = since or local_today(user) - timedelta(days=HISTORY_DAYS)
    s_dt = _bounds(user, since)
    tasks, focus, learning = defaultdict(int), defaultdict(int), defaultdict(int)
    habits: set[date] = set()
    for (ts,) in db.execute(select(Task.completed_at).where(Task.user_id == user.id, Task.completed_at >= s_dt)):
        tasks[ts.astimezone(tz).date()] += 1
    for (d,) in db.execute(select(HabitLog.log_date).where(HabitLog.user_id == user.id, HabitLog.status == "done",
                                                           HabitLog.log_date >= since)):
        habits.add(d)
    for ts, secs in db.execute(select(FocusSession.started_at, FocusSession.focused_seconds).where(
            FocusSession.user_id == user.id, FocusSession.status == "completed", FocusSession.started_at >= s_dt)):
        focus[ts.astimezone(tz).date()] += (secs or 0) // 60 or 1
    for ts, mins in db.execute(select(LearningSession.started_at, LearningSession.duration_minutes).where(
            LearningSession.user_id == user.id, LearningSession.started_at >= s_dt)):
        learning[ts.astimezone(tz).date()] += mins or 0
    frozen = set(db.scalars(select(StreakFreeze.day).where(StreakFreeze.user_id == user.id,
                                                           StreakFreeze.day >= since)))
    activity = set(tasks) | habits | set(focus)
    productive = {d for d in activity | set(learning)
                  if tasks[d] >= PRODUCTIVE["tasks"] or focus[d] >= PRODUCTIVE["focus_minutes"]
                  or learning[d] >= PRODUCTIVE["learning_minutes"]}
    return {"activity": activity, "habits": habits, "productive": productive, "frozen": frozen}


def current(days: set[date], today: date) -> int:
    d = today if today in days else today - timedelta(days=1)
    n = 0
    while d in days:
        n += 1
        d -= timedelta(days=1)
    return n


def runs(days: set[date], min_len: int = 2) -> list[dict]:
    """Streak history: consecutive runs, newest first."""
    out, start, prev = [], None, None
    for d in sorted(days):
        if prev and d == prev + timedelta(days=1):
            prev = d
            continue
        if start and (prev - start).days + 1 >= min_len:
            out.append({"start": start.isoformat(), "end": prev.isoformat(), "length": (prev - start).days + 1})
        start = prev = d
    if start and (prev - start).days + 1 >= min_len:
        out.append({"start": start.isoformat(), "end": prev.isoformat(), "length": (prev - start).days + 1})
    return sorted(out, key=lambda r: r["end"], reverse=True)


def week_streak(activity: set[date], today: date, min_days: int = 4) -> tuple[int, int]:
    """(current, best) consecutive ISO weeks with >= min_days active days. The running week counts once reached."""
    per_week = defaultdict(int)
    for d in activity:
        per_week[d - timedelta(days=d.weekday())] += 1
    good = {w for w, n in per_week.items() if n >= min_days}
    this_week = today - timedelta(days=today.weekday())
    w = this_week if this_week in good else this_week - timedelta(days=7)
    cur = 0
    while w in good:
        cur += 1
        w -= timedelta(days=7)
    best, run, prev = 0, 0, None
    for w in sorted(good):
        run = run + 1 if prev and w == prev + timedelta(days=7) else 1
        best, prev = max(best, run), w
    return cur, best


def summary(db, user) -> dict:
    today = local_today(user)
    s = day_sets(db, user)
    activity = s["activity"] | s["frozen"]
    hist = runs(activity)
    wk_cur, wk_best = week_streak(s["activity"], today)
    return {
        "today_active": today in s["activity"],
        "daily": {"current": current(activity, today), "best": max([r["length"] for r in hist] or [0])},
        "habits": {"current": current(s["habits"], today), "best": max([r["length"] for r in runs(s["habits"])] or [0])},
        "productive": {"current": current(s["productive"], today),
                       "best": max([r["length"] for r in runs(s["productive"])] or [0])},
        "weeks": {"current": wk_cur, "best": wk_best},
        "history": hist[:12],
        "frozen_days": sorted(d.isoformat() for d in s["frozen"] if d >= today - timedelta(days=60)),
        "calendar": sorted(d.isoformat() for d in activity if d >= today - timedelta(days=364)),
    }


def activity_current(db, user) -> int:
    s = day_sets(db, user)
    return current(s["activity"] | s["frozen"], local_today(user))


def best_activity_streak(db, user) -> int:
    s = day_sets(db, user)
    return max([r["length"] for r in runs(s["activity"] | s["frozen"], 1)] or [0])


def best_week_streak(db, user) -> int:
    return week_streak(day_sets(db, user)["activity"], local_today(user))[1]
