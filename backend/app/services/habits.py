"""Habit scheduling and statistics.

A day is "scheduled" for a habit when:
  daily          -> every day
  selected_days  -> weekday in schedule["weekdays"] (Mon=0)
  weekly         -> evaluated per ISO week: success if done-days in week >= schedule.times_per_period (default 1)
  monthly        -> per calendar month, times_per_period (default 1)
  custom         -> every schedule.interval_days days from start_date
A logged day counts as success when status == 'done' and value >= target (boolean habits: target 1).
'skipped' days are neutral: they do not break the streak and are excluded from completion rate.
"""
from collections import defaultdict
from datetime import date, timedelta


def _is_success(log, target: float) -> bool:
    return log is not None and log.status == "done" and log.value >= target


def is_scheduled_day(habit, d: date) -> bool:
    if d < habit.start_date or (habit.end_date and d > habit.end_date):
        return False
    f = habit.frequency
    sched = habit.schedule or {}
    if f == "selected_days":
        return d.weekday() in sched.get("weekdays", [])
    if f == "custom":
        n = max(1, int(sched.get("interval_days", 1)))
        return (d - habit.start_date).days % n == 0
    return True  # daily; weekly/monthly are period based


def _period_key(habit, d: date):
    if habit.frequency == "weekly":
        y, w, _ = d.isocalendar()
        return (y, w)
    if habit.frequency == "monthly":
        return (d.year, d.month)
    return d


def compute_stats(habit, logs: list, today: date) -> dict:
    by_day = {lg.log_date: lg for lg in logs}
    target = habit.target if habit.kind != "boolean" else 1
    end = min(today, habit.end_date) if habit.end_date else today
    period_based = habit.frequency in ("weekly", "monthly")
    need = max(1, int((habit.schedule or {}).get("times_per_period", 1)))

    # Build ordered list of evaluation units: (key, success|None(skip)|False, is_current_period)
    units: list[tuple] = []
    if period_based:
        periods: dict = defaultdict(lambda: {"done": 0, "skipped": 0, "days": []})
        d = habit.start_date
        while d <= end:
            k = _period_key(habit, d)
            p = periods[k]
            p["days"].append(d)
            lg = by_day.get(d)
            if _is_success(lg, target):
                p["done"] += 1
            elif lg and lg.status == "skipped":
                p["skipped"] += 1
            d += timedelta(days=1)
        cur_key = _period_key(habit, today)
        for k, p in periods.items():
            if p["done"] >= need:
                units.append((k, True, k == cur_key))
            elif p["skipped"] and p["done"] == 0:
                units.append((k, None, k == cur_key))
            else:
                units.append((k, False, k == cur_key))
    else:
        d = habit.start_date
        while d <= end:
            if is_scheduled_day(habit, d):
                lg = by_day.get(d)
                if _is_success(lg, target):
                    units.append((d, True, d == today))
                elif lg and lg.status == "skipped":
                    units.append((d, None, d == today))
                else:
                    units.append((d, False, d == today))
            d += timedelta(days=1)

    # streaks: the current (unfinished) unit does not break the streak if not yet done
    current = 0
    for _, ok, is_cur in reversed(units):
        if ok is True:
            current += 1
        elif ok is None or (ok is False and is_cur):
            continue
        else:
            break
    best = run = 0
    for _, ok, is_cur in units:
        if ok is True:
            run += 1
            best = max(best, run)
        elif ok is None or is_cur:
            continue
        else:
            run = 0
    evaluated = [u for u in units if u[1] is not None and not (u[2] and u[1] is False)]
    successes = sum(1 for u in evaluated if u[1])
    missed = sum(1 for u in evaluated if u[1] is False)
    rate = round(successes / len(evaluated) * 100, 1) if evaluated else 0.0

    def window_rate(days: int) -> float:
        start = today - timedelta(days=days - 1)
        sched = [d for d in (start + timedelta(i) for i in range(days))
                 if d >= habit.start_date and d <= end and is_scheduled_day(habit, d)]
        if period_based:
            done = sum(1 for d in sched if _is_success(by_day.get(d), target))
            expected = max(1, round(days / (7 if habit.frequency == "weekly" else 30) * need))
            return round(min(done / expected, 1) * 100, 1)
        valid = [d for d in sched if not (by_day.get(d) and by_day[d].status == "skipped")]
        if not valid:
            return 0.0
        return round(sum(1 for d in valid if _is_success(by_day.get(d), target)) / len(valid) * 100, 1)

    return {
        "current_streak": current,
        "best_streak": best,
        "completion_rate": rate,
        "weekly_completion": window_rate(7),
        "monthly_completion": window_rate(30),
        "yearly_completion": window_rate(365),
        "missed": missed,
        "total_completions": sum(1 for lg in logs if lg.status == "done"),
        "streak_unit": "period" if period_based else "day",
    }
