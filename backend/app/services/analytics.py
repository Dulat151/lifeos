"""Analytics engine. All metrics are computed from real rows; formulas (also in ARCHITECTURE.md):

Period P = [start, end] in the user's local dates.
- task_completion_rate = done / considered * 100
    considered = top-level, non-template, non-deleted, non-cancelled tasks with due date in P or completed in P
- habit_completion_rate = successful scheduled habit-days / evaluated scheduled habit-days * 100
    (daily / selected_days / custom habits; skipped days excluded; weekly & monthly habits counted as
     done-days / expected-days where expected = times_per_period * number of periods in P)
- goal_progress = mean progress of active goals (see goals.py)
- learning_hours = sum(learning_sessions.duration_minutes in P) / 60
- focus_hours = sum(completed non-break focus_sessions.focused_seconds in P) / 3600
- reading_pages = sum(reading_sessions.pages in P)
- workouts = count of non-rest workouts in P, workout_minutes = sum of their duration
- finance = income, expense, balance in the user's main currency within P
- productivity_score (0..100) = 0.4*task_rate + 0.4*habit_rate + 0.2*min(focus_minutes_per_day/120, 1)*100
    Components with no data are excluded and weights renormalised; with no data at all the score is null.
"""
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.time import user_tz
from app.models import (FocusSession, Goal, Habit, HabitLog, LearningSession, ReadingSession, Task, Transaction,
                        Workout)
from app.services.habits import is_scheduled_day


def _bounds(user, start: date, end: date):
    tz = user_tz(user)
    return datetime.combine(start, time.min, tz), datetime.combine(end + timedelta(days=1), time.min, tz)


def _days(start: date, end: date):
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def compute(db: Session, user, start: date, end: date, category: str | None = None) -> dict:
    tz = user_tz(user)
    s_dt, e_dt = _bounds(user, start, end)
    days = _days(start, end)
    n_days = len(days)

    # ---- tasks
    tq = select(Task).where(Task.user_id == user.id, Task.deleted_at.is_(None), Task.is_template.is_(False),
                            Task.parent_id.is_(None), Task.status != "cancelled",
                            ((Task.due_at >= s_dt) & (Task.due_at < e_dt)) |
                            ((Task.completed_at >= s_dt) & (Task.completed_at < e_dt)))
    if category:
        tq = tq.where(Task.category == category)
    tasks = db.scalars(tq).all()
    done_tasks = [t for t in tasks if t.status == "done"]
    task_rate = round(len(done_tasks) / len(tasks) * 100, 1) if tasks else None

    # ---- habits
    hq = select(Habit).where(Habit.user_id == user.id, Habit.deleted_at.is_(None))
    if category:
        hq = hq.where(Habit.category == category)
    habits = db.scalars(hq).all()
    logs = db.scalars(select(HabitLog).where(HabitLog.user_id == user.id, HabitLog.log_date >= start,
                                             HabitLog.log_date <= end)).all()
    by = {(lg.habit_id, lg.log_date): lg for lg in logs}
    h_ok = h_eval = 0
    habit_daily = defaultdict(int)
    for h in habits:
        target = 1 if h.kind == "boolean" else h.target
        if h.frequency in ("weekly", "monthly"):
            need = max(1, int((h.schedule or {}).get("times_per_period", 1)))
            active_days = [d for d in days if d >= h.start_date and (not h.end_date or d <= h.end_date)]
            if not active_days:
                continue
            periods = len({(d.isocalendar()[:2] if h.frequency == "weekly" else (d.year, d.month))
                           for d in active_days})
            done = sum(1 for d in active_days if (lg := by.get((h.id, d))) and lg.status == "done"
                       and lg.value >= target)
            h_ok += min(done, need * periods)
            h_eval += need * periods
            for d in active_days:
                if (lg := by.get((h.id, d))) and lg.status == "done" and lg.value >= target:
                    habit_daily[d] += 1
            continue
        for d in days:
            if not is_scheduled_day(h, d):
                continue
            lg = by.get((h.id, d))
            if lg and lg.status == "skipped":
                continue
            h_eval += 1
            if lg and lg.status == "done" and lg.value >= target:
                h_ok += 1
                habit_daily[d] += 1
    habit_rate = round(h_ok / h_eval * 100, 1) if h_eval else None

    # ---- focus / learning / reading / workouts
    focus = db.scalars(select(FocusSession).where(FocusSession.user_id == user.id,
                                                  FocusSession.status == "completed", FocusSession.kind != "break",
                                                  FocusSession.started_at >= s_dt,
                                                  FocusSession.started_at < e_dt)).all()
    learn = db.scalars(select(LearningSession).where(LearningSession.user_id == user.id,
                                                     LearningSession.started_at >= s_dt,
                                                     LearningSession.started_at < e_dt)).all()
    reading = db.scalars(select(ReadingSession).where(ReadingSession.user_id == user.id,
                                                      ReadingSession.read_on >= start,
                                                      ReadingSession.read_on <= end)).all()
    workouts = db.scalars(select(Workout).where(Workout.user_id == user.id, Workout.is_rest_day.is_(False),
                                                Workout.performed_on >= start, Workout.performed_on <= end)).all()
    focus_min = sum(f.focused_seconds for f in focus) / 60
    learn_min = sum(x.duration_minutes for x in learn)

    # ---- finance (main currency)
    cur = user.settings.currency
    fin = dict(db.execute(select(Transaction.kind, func.coalesce(func.sum(Transaction.amount), 0)).where(
        Transaction.user_id == user.id, Transaction.deleted_at.is_(None), Transaction.currency == cur,
        Transaction.occurred_on >= start, Transaction.occurred_on <= end).group_by(Transaction.kind)).all())
    income, expense = Decimal(fin.get("income", 0)), Decimal(fin.get("expense", 0))

    # ---- goals
    from app.api.v1.goals import goal_progress

    gq = select(Goal).where(Goal.user_id == user.id, Goal.deleted_at.is_(None), Goal.status == "active")
    if category:
        gq = gq.where(Goal.category == category)
    goals = db.scalars(gq).all()
    goal_avg = round(sum(goal_progress(db, g) for g in goals) / len(goals), 1) if goals else None

    # ---- productivity score
    comps = []
    if task_rate is not None:
        comps.append((0.4, task_rate))
    if habit_rate is not None:
        comps.append((0.4, habit_rate))
    if focus:
        comps.append((0.2, min(focus_min / n_days / 120, 1) * 100))
    score = round(sum(w * v for w, v in comps) / sum(w for w, _ in comps), 1) if comps else None

    # ---- daily series
    series = []
    tasks_by_day = defaultdict(int)
    for t in done_tasks:
        if t.completed_at:
            tasks_by_day[t.completed_at.astimezone(tz).date()] += 1
    f_by = defaultdict(float)
    for f in focus:
        f_by[f.started_at.astimezone(tz).date()] += f.focused_seconds / 60
    l_by = defaultdict(int)
    for x in learn:
        l_by[x.started_at.astimezone(tz).date()] += x.duration_minutes
    for d in days:
        series.append({"date": d.isoformat(), "tasks_done": tasks_by_day[d], "habit_checks": habit_daily[d],
                       "focus_minutes": round(f_by[d]), "learning_minutes": l_by[d]})

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat(), "days": n_days},
        "task_completion_rate": task_rate, "tasks_considered": len(tasks), "tasks_done": len(done_tasks),
        "habit_completion_rate": habit_rate, "habit_days_evaluated": h_eval, "habit_days_done": h_ok,
        "goal_progress": goal_avg, "active_goals": len(goals),
        "learning_hours": round(learn_min / 60, 2), "focus_hours": round(focus_min / 60, 2),
        "focus_sessions": len(focus),
        "reading_pages": sum(r.pages for r in reading), "reading_minutes": sum(r.minutes for r in reading),
        "workouts": len(workouts), "workout_minutes": sum(w.duration_minutes for w in workouts),
        "finance": {"currency": cur, "income": str(income), "expense": str(expense), "balance": str(income - expense)},
        "productivity_score": score,
        "series": series,
    }


def activity_streak(db: Session, user, today: date) -> int:
    """Consecutive days (ending today, or yesterday if today has nothing yet) with at least one completed task,
    habit check or completed focus session. Days covered by a streak freeze count. See services/streaks.py."""
    from app.services import streaks

    s = streaks.day_sets(db, user)
    return streaks.current(s["activity"] | s["frozen"], today)
