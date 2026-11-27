"""Quests, coins & rewards shop, streaks (with restore), Progress page and weekly report."""
from collections import defaultdict
from datetime import datetime, time, timedelta
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.core.time import local_today, user_tz
from app.models import Goal, XPTransaction
from app.services import gamification as gm
from app.services import rewards, streaks
from app.services.analytics import compute

router = APIRouter(tags=["rewards"])


# ---------------------------------------------------------------- quests

@router.get("/quests")
def list_quests(db: DB, user: CurrentUser):
    return {"enabled": user.settings.gamification_enabled, "quests": rewards.quests_view(db, user)}


@router.post("/quests/{code}/claim")
def claim_quest(code: str, db: DB, user: CurrentUser):
    res = rewards.claim(db, user, code)
    db.commit()
    return {**res, "coins_balance": rewards.balance(db, user.id), "xp_total": gm.total_xp(db, user.id)}


# ---------------------------------------------------------------- shop

@router.get("/shop")
def shop(db: DB, user: CurrentUser):
    return rewards.shop_view(db, user)


@router.post("/shop/{code}/buy")
def buy(code: str, db: DB, user: CurrentUser):
    res = rewards.buy(db, user, code)
    db.commit()
    return res


class EquipIn(BaseModel):
    kind: Literal["theme", "badge", "frame"]
    code: str | None = None


@router.post("/shop/equip")
def equip(payload: EquipIn, db: DB, user: CurrentUser):
    res = rewards.equip(db, user, payload.code, payload.kind)
    db.commit()
    return res


@router.get("/coins/history")
def coins_history(db: DB, user: CurrentUser, limit: int = Query(50, ge=1, le=500)):
    from app.models import CoinTransaction

    rows = db.scalars(select(CoinTransaction).where(CoinTransaction.user_id == user.id)
                      .order_by(CoinTransaction.created_at.desc()).limit(limit))
    return [{"amount": r.amount, "reason": r.reason, "at": r.created_at.isoformat()} for r in rows]


# ---------------------------------------------------------------- streaks

@router.get("/streaks")
def get_streaks(db: DB, user: CurrentUser):
    return {**streaks.summary(db, user), "restore": rewards.restore_status(db, user)}


@router.post("/streaks/restore")
def restore_streak(db: DB, user: CurrentUser):
    res = rewards.restore(db, user)
    db.commit()
    return {**res, **streaks.summary(db, user)}


# ---------------------------------------------------------------- progress

def _xp_by_day(db, user, start, end) -> dict[str, int]:
    tz = user_tz(user)
    s = datetime.combine(start, time.min, tz)
    e = datetime.combine(end + timedelta(days=1), time.min, tz)
    out = defaultdict(int)
    for amount, at in db.execute(select(XPTransaction.amount, XPTransaction.created_at).where(
            XPTransaction.user_id == user.id, XPTransaction.created_at >= s, XPTransaction.created_at < e)):
        out[at.astimezone(tz).date().isoformat()] += amount
    return out


@router.get("/progress")
def progress(db: DB, user: CurrentUser, period: Literal["week", "month", "year"] = "month"):
    from app.api.v1.goals import goal_read

    today = local_today(user)
    start = today - timedelta(days={"week": 6, "month": 29, "year": 364}[period])
    data = compute(db, user, start, today)
    xp_days = _xp_by_day(db, user, start, today)
    series = [{**d, "xp": xp_days.get(d["date"], 0)} for d in data["series"]]
    if period == "year":  # aggregate by ISO week to keep the chart readable
        weeks: dict[str, dict] = {}
        for d in series:
            dd = datetime.fromisoformat(d["date"]).date()
            k = (dd - timedelta(days=dd.weekday())).isoformat()
            w = weeks.setdefault(k, {"date": k, "tasks_done": 0, "habit_checks": 0, "focus_minutes": 0, "xp": 0})
            for f in ("tasks_done", "habit_checks", "focus_minutes", "xp"):
                w[f] += d.get(f, 0) or 0
        series = list(weeks.values())
    xp = gm.total_xp(db, user.id)
    lvl = gm.level_for_xp(xp)
    goals = [goal_read(db, g).model_dump(mode="json") for g in db.scalars(
        select(Goal).where(Goal.user_id == user.id, Goal.deleted_at.is_(None), Goal.status.in_(("active", "completed")))
        .order_by(Goal.status, Goal.deadline.asc().nulls_last()).limit(12))]
    return {
        "period": period, "start": start.isoformat(), "end": today.isoformat(),
        "totals": {"tasks_done": data["tasks_done"], "habit_checks": sum(d.get("habit_checks", 0) for d in series),
                   "focus_minutes": round(data["focus_hours"] * 60), "learning_minutes": round(data["learning_hours"] * 60),
                   "xp": sum(d["xp"] for d in series), "habit_completion_rate": data["habit_completion_rate"],
                   "task_completion_rate": data["task_completion_rate"], "productivity_score": data["productivity_score"]},
        "series": series,
        "level": {"level": lvl, "xp": xp, "start": gm.xp_for_level(lvl), "next": gm.xp_for_level(lvl + 1)},
        "coins": rewards.balance(db, user.id),
        "streaks": streaks.summary(db, user),
        "goals": goals,
    }


def _pct_change(cur: float, prev: float) -> int | None:
    if not prev:
        return None
    return round((cur - prev) / prev * 100)


@router.get("/progress/weekly-report")
def weekly_report(db: DB, user: CurrentUser):
    """Rule-based summary of the last 7 days vs the 7 days before. Only facts from the user's data."""
    today = local_today(user)
    cur = compute(db, user, today - timedelta(days=6), today)
    prev = compute(db, user, today - timedelta(days=13), today - timedelta(days=7))
    xp_cur = sum(_xp_by_day(db, user, today - timedelta(days=6), today).values())
    xp_prev = sum(_xp_by_day(db, user, today - timedelta(days=13), today - timedelta(days=7)).values())
    best = max(cur["series"], key=lambda d: (d.get("tasks_done", 0) + d.get("habit_checks", 0)), default=None)
    insights: list[str] = []
    if cur["tasks_done"] or prev["tasks_done"]:
        ch = _pct_change(cur["tasks_done"], prev["tasks_done"])
        insights.append(f"Выполнено задач: {cur['tasks_done']}" + (
            f" ({'+' if ch >= 0 else ''}{ch}% к прошлой неделе)." if ch is not None else "."))
    if cur["habit_completion_rate"] is not None:
        insights.append(f"Привычки выполнены на {cur['habit_completion_rate']}% от запланированного.")
    if best and (best.get("tasks_done", 0) + best.get("habit_checks", 0)) > 0:
        d = datetime.fromisoformat(best["date"]).date()
        days = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]
        insights.append(f"Самый продуктивный день — {days[d.weekday()]}, {d.strftime('%d.%m')}.")
    if cur["focus_hours"]:
        insights.append(f"Время в фокусе: {round(cur['focus_hours'] * 60)} мин.")
    st = streaks.summary(db, user)
    if st["daily"]["current"] >= 2:
        insights.append(f"Серия активных дней: {st['daily']['current']} (рекорд {st['daily']['best']}).")
    tips: list[str] = []
    if cur["habit_completion_rate"] is not None and cur["habit_completion_rate"] < 60:
        tips.append("Привычки выполняются реже половины дней — попробуйте уменьшить их число или цель.")
    if cur["tasks_done"] < prev["tasks_done"]:
        tips.append("Задач меньше, чем неделей раньше: выберите 1–3 главные задачи в «Сегодняшнем фокусе».")
    if not cur["tasks_done"] and not cur["habit_days_done"]:
        tips.append("На этой неделе пока нет выполненных задач и привычек — начните с одной маленькой задачи.")
    return {
        "start": (today - timedelta(days=6)).isoformat(), "end": today.isoformat(),
        "metrics": {
            "tasks_done": {"value": cur["tasks_done"], "prev": prev["tasks_done"]},
            "habit_completion_rate": {"value": cur["habit_completion_rate"], "prev": prev["habit_completion_rate"]},
            "focus_minutes": {"value": round(cur["focus_hours"] * 60), "prev": round(prev["focus_hours"] * 60)},
            "learning_minutes": {"value": round(cur["learning_hours"] * 60), "prev": round(prev["learning_hours"] * 60)},
            "xp": {"value": xp_cur, "prev": xp_prev},
        },
        "insights": insights, "tips": tips,
        "has_data": bool(cur["tasks_done"] or cur["habit_days_done"] or cur["focus_hours"] or xp_cur),
    }

