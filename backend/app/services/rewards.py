"""Coins, rewards shop, quests and streak restore. Virtual only: no real payments, no random rewards.

Coins: every XP award also grants coins = max(1, XP // 5) under the same idempotency key (so undo/redo cannot
farm coins); quests grant their own coins on claim; the shop spends them.
Quests: daily and weekly templates whose progress is computed from real data in the current period
(user's local day / ISO week). A completed quest is claimed once per period.
"""
import uuid
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from app.core.time import local_today, user_tz, utcnow
from app.models import (
    CoinTransaction,
    FocusSession,
    Habit,
    HabitLog,
    JournalEntry,
    LearningSession,
    Note,
    ReadingSession,
    StreakFreeze,
    Task,
    UserItem,
    Workout,
    XPTransaction,
)

# ---------------------------------------------------------------- coins


def coins_for_xp(xp: int) -> int:
    return max(1, xp // 5) if xp > 0 else 0


def grant_coins(db, user_id, amount: int, reason: str, key: str) -> bool:
    if not amount:
        return False
    res = db.execute(insert(CoinTransaction).values(
        id=uuid.uuid4(), user_id=user_id, amount=amount, reason=reason, idempotency_key=key, created_at=utcnow(),
    ).on_conflict_do_nothing(constraint="uq_coin_idem").returning(CoinTransaction.id)).scalar()
    return res is not None


def balance(db, user_id) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(CoinTransaction.amount), 0)).where(
        CoinTransaction.user_id == user_id)) or 0)


# ---------------------------------------------------------------- shop

SHOP = [
    # themes recolour the accent of the whole interface
    {"code": "theme_ocean", "kind": "theme", "title": "Тема «Океан»", "price": 60, "value": "#38bdf8",
     "description": "Спокойный голубой акцент"},
    {"code": "theme_forest", "kind": "theme", "title": "Тема «Лес»", "price": 60, "value": "#34d399",
     "description": "Свежий зелёный акцент"},
    {"code": "theme_sunset", "kind": "theme", "title": "Тема «Закат»", "price": 80, "value": "#fb923c",
     "description": "Тёплый оранжевый акцент"},
    {"code": "theme_rose", "kind": "theme", "title": "Тема «Роза»", "price": 80, "value": "#f472b6",
     "description": "Мягкий розовый акцент"},
    {"code": "theme_gold", "kind": "theme", "title": "Тема «Золото»", "price": 150, "value": "#fbbf24",
     "description": "Для тех, кто дошёл далеко"},
    # badges are shown next to the name in the profile and on the dashboard
    {"code": "badge_sprout", "kind": "badge", "title": "Значок «Росток»", "price": 30, "value": "sprout",
     "description": "Начало пути"},
    {"code": "badge_flame", "kind": "badge", "title": "Значок «Пламя»", "price": 60, "value": "flame",
     "description": "Для любителей серий"},
    {"code": "badge_rocket", "kind": "badge", "title": "Значок «Ракета»", "price": 90, "value": "rocket",
     "description": "Быстрый рост"},
    {"code": "badge_crown", "kind": "badge", "title": "Значок «Корона»", "price": 200, "value": "crown",
     "description": "Мастер саморазвития"},
    # avatar frames
    {"code": "frame_glow", "kind": "frame", "title": "Рамка «Сияние»", "price": 70, "value": "glow",
     "description": "Подсветка аватара цветом акцента"},
    {"code": "frame_gradient", "kind": "frame", "title": "Рамка «Градиент»", "price": 120, "value": "gradient",
     "description": "Переливающаяся рамка аватара"},
    # consumable
    {"code": "streak_freeze", "kind": "consumable", "title": "Заморозка серии", "price": 40, "value": None,
     "description": "Закрывает один пропущенный день, серия не обнулится. Можно хранить до 3.", "max": 3},
]
SHOP_BY_CODE = {i["code"]: i for i in SHOP}


def inventory(db, user_id) -> dict[str, int]:
    return {i.item_code: i.quantity for i in db.scalars(select(UserItem).where(UserItem.user_id == user_id))}


def shop_view(db, user) -> dict:
    inv = inventory(db, user.id)
    cos = user.settings.cosmetics or {}
    items = []
    for it in SHOP:
        owned = inv.get(it["code"], 0)
        equipped = (it["kind"] == "theme" and cos.get("accent_item") == it["code"]) or \
                   (it["kind"] in ("badge", "frame") and cos.get(it["kind"]) == it["code"])
        items.append({**it, "owned": owned, "equipped": equipped})
    return {"coins": balance(db, user.id), "items": items, "cosmetics": cos}


def buy(db, user, code: str) -> dict:
    it = SHOP_BY_CODE.get(code)
    if not it:
        raise HTTPException(404, "Такого предмета нет")
    owned = inventory(db, user.id).get(code, 0)
    if it["kind"] != "consumable" and owned:
        raise HTTPException(409, "Уже куплено")
    if it["kind"] == "consumable" and owned >= it.get("max", 99):
        raise HTTPException(409, f"Можно хранить не больше {it['max']}")
    # lock the user's coin rows so two parallel purchases cannot overspend
    db.execute(select(CoinTransaction.id).where(CoinTransaction.user_id == user.id).with_for_update())
    if balance(db, user.id) < it["price"]:
        raise HTTPException(402, "Недостаточно монет")
    grant_coins(db, user.id, -it["price"], f"purchase:{code}", f"purchase:{code}:{uuid.uuid4()}")
    row = db.scalar(select(UserItem).where(UserItem.user_id == user.id, UserItem.item_code == code))
    if row:
        row.quantity += 1
    else:
        db.add(UserItem(user_id=user.id, item_code=code, quantity=1, acquired_at=utcnow()))
    db.flush()
    return shop_view(db, user)


def equip(db, user, code: str | None, kind: str) -> dict:
    cos = dict(user.settings.cosmetics or {})
    if code is None:
        if kind == "theme":
            cos.pop("accent", None)
            cos.pop("accent_item", None)
        else:
            cos.pop(kind, None)
    else:
        it = SHOP_BY_CODE.get(code)
        if not it or it["kind"] != kind:
            raise HTTPException(404, "Такого предмета нет")
        if not inventory(db, user.id).get(code):
            raise HTTPException(403, "Сначала купите предмет")
        if kind == "theme":
            cos["accent"], cos["accent_item"] = it["value"], code
        else:
            cos[kind] = code
            cos[f"{kind}_value"] = it["value"]
    user.settings.cosmetics = cos
    db.flush()
    return shop_view(db, user)


# ---------------------------------------------------------------- quests

QUESTS = [
    # code, period, category, title, metric, target, xp, coins
    ("d_tasks3", "daily", "productivity", "Выполнить 3 задачи", "tasks_done", 3, 20, 8),
    ("d_habits_all", "daily", "habits", "Выполнить все привычки дня", "habits_all", 1, 20, 8),
    ("d_plan", "daily", "planning", "Выбрать «Сегодняшний фокус»", "day_planned", 1, 10, 4),
    ("d_learn30", "daily", "learning", "30 минут обучения", "learning_minutes", 30, 15, 6),
    ("d_read10", "daily", "reading", "Прочитать 10 страниц", "pages", 10, 15, 6),
    ("d_focus25", "daily", "focus", "Фокус-сессия от 25 минут", "focus_minutes", 25, 15, 6),
    ("w_tasks15", "weekly", "productivity", "15 задач за неделю", "tasks_done", 15, 60, 25),
    ("w_habits20", "weekly", "habits", "20 отметок привычек", "habit_checks", 20, 50, 20),
    ("w_learn120", "weekly", "learning", "2 часа обучения", "learning_minutes", 120, 50, 20),
    ("w_workouts3", "weekly", "health", "3 тренировки", "workouts", 3, 50, 20),
    ("w_review", "weekly", "reflection", "Сделать обзор недели", "weekly_review", 1, 40, 15),
]
QUEST_BY_CODE = {q[0]: q for q in QUESTS}
CATEGORY_LABELS = {"productivity": "Продуктивность", "habits": "Привычки", "planning": "Планирование",
                   "learning": "Обучение", "reading": "Чтение", "focus": "Фокус", "health": "Здоровье",
                   "reflection": "Рефлексия"}


def _period(user, period: str) -> tuple[date, date, str]:
    today = local_today(user)
    if period == "daily":
        return today, today, today.isoformat()
    start = today - timedelta(days=today.weekday())
    return start, start + timedelta(days=6), f"{start.isocalendar().year}-W{start.isocalendar().week:02d}"


def quest_metric(db, user, metric: str, start: date, end: date) -> int:
    tz = user_tz(user)
    s = datetime.combine(start, time.min, tz)
    e = datetime.combine(end + timedelta(days=1), time.min, tz)
    uid = user.id
    if metric == "tasks_done":
        q = select(func.count()).select_from(Task).where(Task.user_id == uid, Task.status == "done",
                                                         Task.completed_at >= s, Task.completed_at < e)
    elif metric == "habit_checks":
        q = select(func.count()).select_from(HabitLog).where(HabitLog.user_id == uid, HabitLog.status == "done",
                                                             HabitLog.log_date >= start, HabitLog.log_date <= end)
    elif metric == "learning_minutes":
        q = select(func.coalesce(func.sum(LearningSession.duration_minutes), 0)).where(
            LearningSession.user_id == uid, LearningSession.started_at >= s, LearningSession.started_at < e)
    elif metric == "focus_minutes":
        q = select(func.coalesce(func.max(FocusSession.focused_seconds), 0) / 60).where(
            FocusSession.user_id == uid, FocusSession.status == "completed", FocusSession.started_at >= s,
            FocusSession.started_at < e)
    elif metric == "pages":
        q = select(func.coalesce(func.sum(ReadingSession.pages), 0)).where(
            ReadingSession.user_id == uid, ReadingSession.read_on >= start, ReadingSession.read_on <= end)
    elif metric == "workouts":
        q = select(func.count()).select_from(Workout).where(Workout.user_id == uid, Workout.is_rest_day.is_(False),
                                                            Workout.performed_on >= start, Workout.performed_on <= end)
    elif metric == "weekly_review":
        j = db.scalar(select(func.count()).select_from(JournalEntry).where(
            JournalEntry.user_id == uid, JournalEntry.deleted_at.is_(None), JournalEntry.kind == "weekly_review",
            JournalEntry.entry_date >= start, JournalEntry.entry_date <= end)) or 0
        n = db.scalar(select(func.count()).select_from(Note).where(
            Note.user_id == uid, Note.deleted_at.is_(None), Note.category == "weekly_review",
            Note.created_at >= s, Note.created_at < e)) or 0
        return int(j + n)
    elif metric == "day_planned":
        pr = (user.settings.dashboard_layout or {}).get("priorities", {})
        return 1 if pr.get(start.isoformat()) else 0
    elif metric == "habits_all":
        from app.api.v1.habits import _read

        hs = [_read(db, user, h, start) for h in db.scalars(select(Habit).where(
            Habit.user_id == uid, Habit.deleted_at.is_(None), Habit.is_active.is_(True)))]
        sched = [h for h in hs if h.scheduled_today]
        return 1 if sched and all(h.today_status == "done" for h in sched) else 0
    else:
        return 0
    return int(db.scalar(q) or 0)


def _claim_key(code: str, period_key: str) -> str:
    return f"quest:{code}:{period_key}"


def quests_view(db, user) -> list[dict]:
    out = []
    claimed = set(db.scalars(select(XPTransaction.idempotency_key).where(
        XPTransaction.user_id == user.id, XPTransaction.idempotency_key.like("quest:%"))))
    for code, period, cat, title, metric, target, xp, coins in QUESTS:
        start, end, pkey = _period(user, period)
        value = quest_metric(db, user, metric, start, end)
        out.append({"code": code, "period": period, "category": cat, "category_label": CATEGORY_LABELS[cat],
                    "title": title, "progress": min(value, target), "target": target, "xp": xp, "coins": coins,
                    "completed": value >= target, "claimed": _claim_key(code, pkey) in claimed,
                    "resets_on": (end + timedelta(days=1)).isoformat()})
    return out


def claim(db, user, code: str) -> dict:
    from app.services import gamification as gm

    q = QUEST_BY_CODE.get(code)
    if not q:
        raise HTTPException(404, "Квест не найден")
    _, period, _, title, metric, target, xp, coins = q
    start, end, pkey = _period(user, period)
    if quest_metric(db, user, metric, start, end) < target:
        raise HTTPException(409, "Квест ещё не выполнен")
    key = _claim_key(code, pkey)
    granted = gm.award(db, user, "quest", "quest", None, key=key, amount=xp, coins=False)
    if not granted:
        raise HTTPException(409, "Награда уже получена")
    grant_coins(db, user.id, coins, "quest", f"coins:{key}")
    return {"xp": xp, "coins": coins, "title": title}


# ---------------------------------------------------------------- streak restore

GRACE_DAYS = 7  # one free restore per week ("не наказывать слишком сильно")


def restore_status(db, user) -> dict:
    from app.services import streaks

    today = local_today(user)
    yesterday = today - timedelta(days=1)
    s = streaks.day_sets(db, user, today - timedelta(days=GRACE_DAYS + 2))
    active = s["activity"] | s["frozen"]
    missed = yesterday not in active and (yesterday - timedelta(days=1)) in active
    last_grace = db.scalar(select(func.max(StreakFreeze.day)).where(StreakFreeze.user_id == user.id,
                                                                    StreakFreeze.source == "weekly_grace"))
    grace_available = not last_grace or (today - last_grace).days > GRACE_DAYS
    return {"missed_yesterday": missed, "free_available": grace_available,
            "freezes": inventory(db, user.id).get("streak_freeze", 0)}


def restore(db, user) -> dict:
    st = restore_status(db, user)
    if not st["missed_yesterday"]:
        raise HTTPException(409, "Восстанавливать нечего: вчерашний день не пропущен или серия уже прервана давно")
    yesterday = local_today(user) - timedelta(days=1)
    if st["free_available"]:
        source = "weekly_grace"
    elif st["freezes"] > 0:
        source = "item"
        row = db.scalar(select(UserItem).where(UserItem.user_id == user.id, UserItem.item_code == "streak_freeze"))
        row.quantity -= 1
        if row.quantity <= 0:
            db.delete(row)
    else:
        raise HTTPException(402, "Нет заморозок: бесплатное восстановление доступно раз в неделю, "
                                 "заморозку можно купить в магазине наград")
    db.add(StreakFreeze(user_id=user.id, day=yesterday, source=source, created_at=utcnow()))
    db.flush()
    return {"restored_day": yesterday.isoformat(), "source": source}
