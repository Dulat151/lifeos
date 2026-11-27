"""XP, levels, achievements.

Level formula (documented in ARCHITECTURE.md):
    XP required to reach level L (L>=1) = 50 * (L-1) * L      -> L2=100, L3=300, L4=600, L5=1000 ...
    level = floor((1 + sqrt(1 + 4*xp/50)) / 2)
"""
import math
import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import (Achievement, Book, FlashcardReview, FocusSession, Goal, HabitLog, JournalEntry,
                        LearningSession, Project, Task, Transaction, User, UserAchievement, Workout, XPTransaction)

XP_RULES = {
    "task_done": 10,
    "habit_check": 5,
    "goal_completed": 100,
    "milestone_completed": 25,
    "focus_session": 15,
    "learning_session": 10,
    "flashcard_review": 1,
    "journal_entry": 5,
    "book_completed": 50,
    "workout": 15,
    "project_completed": 50,
    "daily_plan": 10,
    "event_done": 5,
}

# Hard tasks give a bonus on top of task_done: urgent priority and long estimates.
TASK_BONUS = {"priority_1": 10, "long_task": 10}
LONG_TASK_MINUTES = 120


def task_xp(task) -> int:
    xp = XP_RULES["task_done"]
    if task.priority == 1:
        xp += TASK_BONUS["priority_1"]
    if (task.estimated_minutes or 0) >= LONG_TASK_MINUTES:
        xp += TASK_BONUS["long_task"]
    return xp


def level_for_xp(xp: int) -> int:
    xp = max(xp, 0)
    return int((1 + math.sqrt(1 + 4 * xp / 50)) // 2)


def xp_for_level(level: int) -> int:
    return 50 * (level - 1) * level


def total_xp(db: Session, user_id: uuid.UUID) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(XPTransaction.amount), 0)).where(
        XPTransaction.user_id == user_id)) or 0)


def _grant_key(db: Session, user_id, base: str) -> str:
    """Grant key for the next award of `base`: base, base#1, base#2 ... (one per completed correction).
    Net XP for one source is therefore never above one award: complete(+) reopen(-) complete(+) = +1 award."""
    n = db.scalar(select(func.count()).select_from(XPTransaction).where(
        XPTransaction.user_id == user_id, XPTransaction.idempotency_key.like(f"correction:{base}%"))) or 0
    return base if n == 0 else f"{base}#{n}"


def award(db: Session, user: User, reason: str, source_type: str, source_id: uuid.UUID | None,
          key: str | None = None, amount: int | None = None, coins: bool = True) -> bool:
    """Idempotent XP award (unique (user_id, idempotency_key)). Returns True if new XP was granted.
    Also grants coins = max(1, XP // 5) under the same key (see services/rewards.py)."""
    if user.settings and not user.settings.gamification_enabled:
        return False
    amt = amount if amount is not None else XP_RULES.get(reason, 0)
    if amt == 0:
        return False
    base = key or f"{reason}:{source_type}:{source_id}"
    idem = _grant_key(db, user.id, base)
    stmt = insert(XPTransaction).values(
        id=uuid.uuid4(), user_id=user.id, amount=amt, reason=reason, source_type=source_type,
        source_id=source_id, idempotency_key=idem, created_at=utcnow(),
    ).on_conflict_do_nothing(constraint="uq_xp_idem")
    granted = db.execute(stmt.returning(XPTransaction.id)).scalar() is not None
    if granted:
        if coins:
            from app.services.rewards import coins_for_xp, grant_coins

            grant_coins(db, user.id, coins_for_xp(amt), reason, f"coins:{idem}")
        check_achievements(db, user)
    return granted


def revoke(db: Session, user: User, reason: str, source_type: str, source_id: uuid.UUID | None,
           key: str | None = None) -> None:
    """Correction when an action is undone (task reopened, habit unchecked): one compensating negative row
    for the latest uncorrected grant."""
    base = key or f"{reason}:{source_type}:{source_id}"
    n = db.scalar(select(func.count()).select_from(XPTransaction).where(
        XPTransaction.user_id == user.id, XPTransaction.idempotency_key.like(f"correction:{base}%"))) or 0
    grant_key = base if n == 0 else f"{base}#{n}"
    orig = db.scalar(select(XPTransaction).where(XPTransaction.user_id == user.id,
                                                 XPTransaction.idempotency_key == grant_key))
    if not orig:
        return
    db.execute(insert(XPTransaction).values(
        id=uuid.uuid4(), user_id=user.id, amount=-orig.amount, reason="correction", source_type=source_type,
        source_id=source_id, idempotency_key=f"correction:{grant_key}", created_at=utcnow(),
    ).on_conflict_do_nothing(constraint="uq_xp_idem"))
    from app.models import CoinTransaction
    from app.services.rewards import grant_coins

    got = db.scalar(select(CoinTransaction.amount).where(CoinTransaction.user_id == user.id,
                                                         CoinTransaction.idempotency_key == f"coins:{grant_key}"))
    if got:
        grant_coins(db, user.id, -got, "correction", f"coins:correction:{grant_key}")


def metric_value(db: Session, user_id: uuid.UUID, metric: str) -> int:
    q = {
        "tasks_done": select(func.count()).select_from(Task).where(Task.user_id == user_id,
                                                                    Task.status == "done"),
        "habit_checks": select(func.count()).select_from(HabitLog).where(HabitLog.user_id == user_id,
                                                                          HabitLog.status == "done"),
        "goals_completed": select(func.count()).select_from(Goal).where(Goal.user_id == user_id,
                                                                         Goal.status == "completed"),
        "focus_minutes": select(func.coalesce(func.sum(FocusSession.focused_seconds), 0) / 60).where(
            FocusSession.user_id == user_id, FocusSession.status == "completed"),
        "learning_minutes": select(func.coalesce(func.sum(LearningSession.duration_minutes), 0)).where(
            LearningSession.user_id == user_id),
        "cards_reviewed": select(func.count()).select_from(FlashcardReview).where(
            FlashcardReview.user_id == user_id),
        "journal_entries": select(func.count()).select_from(JournalEntry).where(
            JournalEntry.user_id == user_id, JournalEntry.deleted_at.is_(None)),
        "books_completed": select(func.count()).select_from(Book).where(Book.user_id == user_id,
                                                                         Book.status == "completed"),
        "workouts": select(func.count()).select_from(Workout).where(Workout.user_id == user_id,
                                                                     Workout.is_rest_day.is_(False)),
        "transactions": select(func.count()).select_from(Transaction).where(Transaction.user_id == user_id),
        "xp": select(func.coalesce(func.sum(XPTransaction.amount), 0)).where(XPTransaction.user_id == user_id),
        "projects_completed": select(func.count()).select_from(Project).where(
            Project.user_id == user_id, Project.status == "done", Project.deleted_at.is_(None)),
    }.get(metric)
    if metric in ("best_streak", "best_week_streak"):
        from app.services import streaks

        u = db.get(User, user_id)
        return streaks.best_activity_streak(db, u) if metric == "best_streak" else streaks.best_week_streak(db, u)
    if q is None:
        return 0
    return int(db.scalar(q) or 0)


def check_achievements(db: Session, user: User) -> list[str]:
    db.flush()  # metrics must see pending changes of the current request
    unlocked_ids = set(db.scalars(select(UserAchievement.achievement_id).where(
        UserAchievement.user_id == user.id)))
    new = []
    for ach in db.scalars(select(Achievement)):
        if ach.id in unlocked_ids:
            continue
        cond = ach.condition or {}
        if metric_value(db, user.id, cond.get("metric", "")) >= int(cond.get("gte", 10**9)):
            res = db.execute(insert(UserAchievement).values(
                id=uuid.uuid4(), user_id=user.id, achievement_id=ach.id, unlocked_at=utcnow(), is_public=False
            ).on_conflict_do_nothing().returning(UserAchievement.id)).scalar()
            if res is not None:
                new.append(ach.code)
                if ach.xp_reward:
                    from app.services.rewards import coins_for_xp, grant_coins

                    grant_coins(db, user.id, coins_for_xp(ach.xp_reward), "achievement", f"coins:achievement:{ach.code}")
                    db.execute(insert(XPTransaction).values(
                        id=uuid.uuid4(), user_id=user.id, amount=ach.xp_reward, reason="achievement",
                        source_type="achievement", source_id=ach.id,
                        idempotency_key=f"achievement:{ach.code}", created_at=utcnow(),
                    ).on_conflict_do_nothing(constraint="uq_xp_idem"))
    return new


ACHIEVEMENTS_SEED = [
    ("first_task", "Первая задача", "First task", "Выполните первую задачу", "check-circle", 20,
     {"metric": "tasks_done", "gte": 1}),
    ("tasks_50", "Исполнитель", "Doer", "Выполните 50 задач", "list-checks", 100, {"metric": "tasks_done", "gte": 50}),
    ("habit_10", "Начало привычки", "Habit starter", "10 отметок привычек", "repeat", 30,
     {"metric": "habit_checks", "gte": 10}),
    ("habit_100", "Железная дисциплина", "Iron discipline", "100 отметок привычек", "flame", 150,
     {"metric": "habit_checks", "gte": 100}),
    ("goal_1", "Цель достигнута", "Goal achieved", "Завершите первую цель", "target", 100,
     {"metric": "goals_completed", "gte": 1}),
    ("focus_600", "Глубокая работа", "Deep worker", "10 часов фокуса", "timer", 100,
     {"metric": "focus_minutes", "gte": 600}),
    ("learn_600", "Ученик", "Scholar", "10 часов обучения", "graduation-cap", 100,
     {"metric": "learning_minutes", "gte": 600}),
    ("cards_100", "Память", "Memory", "100 повторений карточек", "layers", 50,
     {"metric": "cards_reviewed", "gte": 100}),
    ("journal_7", "Рефлексия", "Reflector", "7 записей в дневнике", "book-open", 40,
     {"metric": "journal_entries", "gte": 7}),
    ("book_1", "Читатель", "Reader", "Прочитайте книгу", "book", 50, {"metric": "books_completed", "gte": 1}),
    ("workout_10", "В форме", "In shape", "10 тренировок", "dumbbell", 60, {"metric": "workouts", "gte": 10}),
    ("tasks_10", "Разгон", "Warming up", "Выполните 10 задач", "zap", 40, {"metric": "tasks_done", "gte": 10}),
    ("streak_7", "Неделя без пропусков", "7-day streak", "7 дней развития подряд", "flame", 70,
     {"metric": "best_streak", "gte": 7}),
    ("streak_30", "Месяц дисциплины", "30-day streak", "30 дней развития подряд", "medal", 300,
     {"metric": "best_streak", "gte": 30}),
    ("weeks_4", "Стабильный ритм", "Steady rhythm", "4 успешные недели подряд (от 4 активных дней)",
     "calendar-check", 150, {"metric": "best_week_streak", "gte": 4}),
    ("learn_60", "Первый час знаний", "First study hour", "1 час обучения", "book-open", 30,
     {"metric": "learning_minutes", "gte": 60}),
    ("project_1", "Проект завершён", "Project shipped", "Завершите первый проект", "folder-check", 100,
     {"metric": "projects_completed", "gte": 1}),
]


def seed_achievements(db: Session) -> None:
    existing = set(db.scalars(select(Achievement.code)))
    for code, tru, ten, dru, icon, xp, cond in ACHIEVEMENTS_SEED:
        if code not in existing:
            db.add(Achievement(code=code, title_ru=tru, title_en=ten, description_ru=dru, icon=icon,
                               xp_reward=xp, condition=cond))
    db.commit()
