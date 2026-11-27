"""Health & fitness, finance, journal, notes/knowledge, focus."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import Owned, SoftDelete, Timestamps, UUIDPk, fk

# ---------------------------------------------------------------- Health & fitness


class Exercise(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "exercises"
    name: Mapped[str] = mapped_column(String(120))
    muscle_group: Mapped[str] = mapped_column(String(60), default="")
    kind: Mapped[str] = mapped_column(String(20), default="strength")  # strength|cardio|mobility|other
    notes: Mapped[str] = mapped_column(Text, default="")


class WorkoutPlan(UUIDPk, Timestamps, SoftDelete, Owned, Base):
    __tablename__ = "workout_plans"
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    weekdays: Mapped[list] = mapped_column(JSON, default=list)  # planned training days (0=Mon)
    exercises: Mapped[list] = mapped_column(JSON, default=list)  # [{exercise_id, sets, reps, duration}]


class Workout(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "workouts"
    plan_id: Mapped[uuid.UUID | None] = fk("workout_plans.id")
    title: Mapped[str] = mapped_column(String(200))
    performed_on: Mapped[date] = mapped_column(Date, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0)
    is_rest_day: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")


class WorkoutSet(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "workout_sets"
    workout_id: Mapped[uuid.UUID] = fk("workouts.id", nullable=False, ondelete="CASCADE")
    exercise_id: Mapped[uuid.UUID] = fk("exercises.id", nullable=False, ondelete="CASCADE")
    set_number: Mapped[int] = mapped_column(Integer, default=1)
    reps: Mapped[int | None] = mapped_column(Integer)
    weight_kg: Mapped[float | None] = mapped_column(Float)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    distance_km: Mapped[float | None] = mapped_column(Float)


class HealthLog(UUIDPk, Timestamps, Owned, Base):
    """sleep (hours), water (ml), walking (steps), energy (1-10), mood (1-10), weight (kg)."""

    __tablename__ = "health_logs"
    kind: Mapped[str] = mapped_column(String(20), index=True)
    log_date: Mapped[date] = mapped_column(Date, index=True)
    value: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(Text, default="")


# ---------------------------------------------------------------- Finance


class Transaction(UUIDPk, Timestamps, SoftDelete, Owned, Base):
    __tablename__ = "transactions"
    kind: Mapped[str] = mapped_column(String(10), index=True)  # income | expense
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3), default="KZT")
    category: Mapped[str] = mapped_column(String(60), default="other", index=True)
    description: Mapped[str] = mapped_column(String(300), default="")
    occurred_on: Mapped[date] = mapped_column(Date, index=True)
    subscription_id: Mapped[uuid.UUID | None] = fk("subscriptions.id")
    savings_goal_id: Mapped[uuid.UUID | None] = fk("savings_goals.id")


class Budget(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "budgets"
    category: Mapped[str] = mapped_column(String(60))
    month: Mapped[date] = mapped_column(Date)  # first day of month
    limit_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3), default="KZT")


class SavingsGoal(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "savings_goals"
    title: Mapped[str] = mapped_column(String(200))
    target_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    saved_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="KZT")
    deadline: Mapped[date | None] = mapped_column(Date)
    is_purchase_plan: Mapped[bool] = mapped_column(Boolean, default=False)  # purchase planning


class Subscription(UUIDPk, Timestamps, Owned, Base):
    """Recurring payments and subscriptions."""

    __tablename__ = "subscriptions"
    title: Mapped[str] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3), default="KZT")
    category: Mapped[str] = mapped_column(String(60), default="subscriptions")
    period: Mapped[str] = mapped_column(String(10), default="monthly")  # weekly|monthly|yearly
    next_payment_on: Mapped[date] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


# ---------------------------------------------------------------- Journal


class JournalTemplate(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "journal_templates"
    title: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20), default="reflection")
    prompts: Mapped[list] = mapped_column(JSON, default=list)


class JournalEntry(UUIDPk, Timestamps, SoftDelete, Owned, Base):
    __tablename__ = "journal_entries"
    kind: Mapped[str] = mapped_column(String(20), default="daily", index=True)
    title: Mapped[str] = mapped_column(String(200), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    entry_date: Mapped[date] = mapped_column(Date, index=True)
    mood: Mapped[int | None] = mapped_column(Integer)  # 1..10
    tags: Mapped[list] = mapped_column(JSON, default=list)
    is_private: Mapped[bool] = mapped_column(Boolean, default=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    template_id: Mapped[uuid.UUID | None] = fk("journal_templates.id")


# ---------------------------------------------------------------- Notes & knowledge


class Folder(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "folders"
    name: Mapped[str] = mapped_column(String(120))
    parent_id: Mapped[uuid.UUID | None] = fk("folders.id", ondelete="CASCADE")


class Note(UUIDPk, Timestamps, SoftDelete, Owned, Base):
    __tablename__ = "notes"
    title: Mapped[str] = mapped_column(String(300))
    content: Mapped[str] = mapped_column(Text, default="")  # Markdown; [[Title]] creates internal links
    folder_id: Mapped[uuid.UUID | None] = fk("folders.id")
    category: Mapped[str | None] = mapped_column(String(60))
    tags: Mapped[list] = mapped_column(JSON, default=list)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    project_id: Mapped[uuid.UUID | None] = fk("projects.id")
    habit_id: Mapped[uuid.UUID | None] = fk("habits.id")
    goal_id: Mapped[uuid.UUID | None] = fk("goals.id")
    course_id: Mapped[uuid.UUID | None] = fk("courses.id")
    book_id: Mapped[uuid.UUID | None] = fk("books.id")
    task_id: Mapped[uuid.UUID | None] = fk("tasks.id")


class NoteLink(Base):
    __tablename__ = "note_links"
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notes.id", ondelete="CASCADE"),
                                                 primary_key=True)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("notes.id", ondelete="CASCADE"),
                                                 primary_key=True)


# ---------------------------------------------------------------- Focus


class FocusSession(UUIDPk, Timestamps, Owned, Base):
    """State machine: running -> paused -> running ... -> completed | cancelled.
    focused_seconds is the accumulated time; segment_started_at marks the current running segment."""

    __tablename__ = "focus_sessions"
    kind: Mapped[str] = mapped_column(String(20), default="pomodoro")  # pomodoro|custom|deep_work|study|work|break
    status: Mapped[str] = mapped_column(String(20), default="running", index=True)
    planned_minutes: Mapped[int] = mapped_column(Integer, default=25)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    segment_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    focused_seconds: Mapped[int] = mapped_column(Integer, default=0)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    task_id: Mapped[uuid.UUID | None] = fk("tasks.id")
    subject_id: Mapped[uuid.UUID | None] = fk("subjects.id")
    note: Mapped[str] = mapped_column(Text, default="")


class Distraction(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "distractions"
    session_id: Mapped[uuid.UUID | None] = fk("focus_sessions.id", ondelete="CASCADE")
    description: Mapped[str] = mapped_column(String(300))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
