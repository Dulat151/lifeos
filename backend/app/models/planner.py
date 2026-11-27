"""Goals, Tasks, Habits, Calendar, Reminders, Notifications."""
import uuid
from datetime import date, datetime

from sqlalchemy import (JSON, Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Integer, String, Text,
                        UniqueConstraint)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import Owned, SoftDelete, Timestamps, UUIDPk, fk

# ---------------------------------------------------------------- Goals


class Goal(UUIDPk, Timestamps, SoftDelete, Owned, Base):
    __tablename__ = "goals"
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(40), default="personal_development", index=True)
    priority: Mapped[int] = mapped_column(Integer, default=2)  # 1 high, 2 medium, 3 low
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)  # active|completed|archived
    start_date: Mapped[date | None] = mapped_column(Date)
    deadline: Mapped[date | None] = mapped_column(Date)
    metric_name: Mapped[str | None] = mapped_column(String(80))  # measurable indicator
    metric_target: Mapped[float | None] = mapped_column(Float)
    metric_current: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str] = mapped_column(Text, default="")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    milestones: Mapped[list["Milestone"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan", order_by="Milestone.position"
    )


class Milestone(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "milestones"
    goal_id: Mapped[uuid.UUID] = fk("goals.id", nullable=False, ondelete="CASCADE")
    title: Mapped[str] = mapped_column(String(200))
    due_date: Mapped[date | None] = mapped_column(Date)
    position: Mapped[int] = mapped_column(Integer, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    goal: Mapped[Goal] = relationship(back_populates="milestones")


class GoalHistory(UUIDPk, Owned, Base):
    __tablename__ = "goal_history"
    goal_id: Mapped[uuid.UUID] = fk("goals.id", nullable=False, ondelete="CASCADE")
    field: Mapped[str] = mapped_column(String(40))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------- Tasks

TASK_STATUSES = ("backlog", "todo", "in_progress", "done", "cancelled")


class Task(UUIDPk, Timestamps, SoftDelete, Owned, Base):
    __tablename__ = "tasks"
    __table_args__ = (CheckConstraint(f"status IN {TASK_STATUSES}", name="ck_task_status"),)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="todo", index=True)
    priority: Mapped[int] = mapped_column(Integer, default=2)  # 1..4 (1 urgent)
    category: Mapped[str | None] = mapped_column(String(40))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    estimated_minutes: Mapped[int | None] = mapped_column(Integer)
    actual_minutes: Mapped[int] = mapped_column(Integer, default=0)
    position: Mapped[float] = mapped_column(Float, default=0)  # ordering inside kanban column
    recurrence_rule: Mapped[str | None] = mapped_column(String(200))  # RFC 5545 RRULE
    parent_id: Mapped[uuid.UUID | None] = fk("tasks.id", ondelete="CASCADE")  # subtasks
    goal_id: Mapped[uuid.UUID | None] = fk("goals.id")  # goal_tasks link
    milestone_id: Mapped[uuid.UUID | None] = fk("milestones.id")
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checklist: Mapped[list["TaskChecklistItem"]] = relationship(
        cascade="all, delete-orphan", order_by="TaskChecklistItem.position"
    )
    tags: Mapped[list["TaskTag"]] = relationship(cascade="all, delete-orphan")


class TaskChecklistItem(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "task_checklists"
    task_id: Mapped[uuid.UUID] = fk("tasks.id", nullable=False, ondelete="CASCADE")
    text: Mapped[str] = mapped_column(String(300))
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)


class TaskTag(Base):
    __tablename__ = "task_tags"
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"),
                                               primary_key=True)
    name: Mapped[str] = mapped_column(String(60), primary_key=True)


class TaskDependency(Base):
    __tablename__ = "task_dependencies"
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"),
                                               primary_key=True)
    depends_on_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"),
                                                     primary_key=True)


class TaskComment(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "task_comments"
    task_id: Mapped[uuid.UUID] = fk("tasks.id", nullable=False, ondelete="CASCADE")
    body: Mapped[str] = mapped_column(Text)


class TaskHistory(UUIDPk, Owned, Base):
    __tablename__ = "task_history"
    task_id: Mapped[uuid.UUID] = fk("tasks.id", nullable=False, ondelete="CASCADE")
    field: Mapped[str] = mapped_column(String(40))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------- Habits


class Habit(UUIDPk, Timestamps, SoftDelete, Owned, Base):
    __tablename__ = "habits"
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str | None] = mapped_column(String(40))
    icon: Mapped[str] = mapped_column(String(40), default="check")
    color: Mapped[str] = mapped_column(String(20), default="#22c55e")
    kind: Mapped[str] = mapped_column(String(10), default="boolean")  # boolean | numeric | duration
    # frequency: daily | weekly | selected_days | monthly | custom
    frequency: Mapped[str] = mapped_column(String(20), default="daily")
    # habit_schedules: weekdays [0..6] (Mon=0) for selected_days; times_per_period for weekly/monthly/custom;
    # interval_days for custom ("every N days")
    schedule: Mapped[dict] = mapped_column(JSON, default=dict)
    target: Mapped[float] = mapped_column(Float, default=1)  # per-occurrence target (count/minutes)
    unit: Mapped[str | None] = mapped_column(String(20))
    allow_multiple_per_day: Mapped[bool] = mapped_column(Boolean, default=False)
    reminder_time: Mapped[str | None] = mapped_column(String(5))  # "08:00" local
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    goal_id: Mapped[uuid.UUID | None] = fk("goals.id")


class HabitLog(UUIDPk, Timestamps, Owned, Base):
    """One row per habit per local day. value accumulates for numeric/duration; 'skipped' keeps a streak alive."""

    __tablename__ = "habit_logs"
    __table_args__ = (UniqueConstraint("habit_id", "log_date", name="uq_habit_log_day"),)
    habit_id: Mapped[uuid.UUID] = fk("habits.id", nullable=False, ondelete="CASCADE")
    log_date: Mapped[date] = mapped_column(Date, index=True)
    value: Mapped[float] = mapped_column(Float, default=1)
    status: Mapped[str] = mapped_column(String(10), default="done")  # done | skipped | partial
    note: Mapped[str] = mapped_column(Text, default="")


# ---------------------------------------------------------------- Calendar


class CalendarEvent(UUIDPk, Timestamps, SoftDelete, Owned, Base):
    __tablename__ = "calendar_events"
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str] = mapped_column(String(200), default="")
    category: Mapped[str] = mapped_column(String(40), default="general")
    color: Mapped[str] = mapped_column(String(20), default="#6366f1")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)  # stored UTC
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")  # IANA tz used to expand recurrence (DST)
    recurrence_rule: Mapped[str | None] = mapped_column(String(200))
    is_time_block: Mapped[bool] = mapped_column(Boolean, default=False)
    task_id: Mapped[uuid.UUID | None] = fk("tasks.id")
    goal_id: Mapped[uuid.UUID | None] = fk("goals.id")
    habit_id: Mapped[uuid.UUID | None] = fk("habits.id")
    external_source: Mapped[str | None] = mapped_column(String(20))  # ics | google | caldav
    external_uid: Mapped[str | None] = mapped_column(String(255), index=True)
    # sync bookkeeping: google {"id"}, caldav {"href", "uid", "etag"}
    external_meta: Mapped[dict | None] = mapped_column(JSON)


# ---------------------------------------------------------------- Reminders & notifications

REMINDER_TYPES = ("task", "habit", "goal", "event", "learning", "workout", "payment", "daily_review",
                  "weekly_review", "custom")


class Reminder(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "reminders"
    kind: Mapped[str] = mapped_column(String(20), default="custom")
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    entity_type: Mapped[str | None] = mapped_column(String(40))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    channels: Mapped[list] = mapped_column(JSON, default=lambda: ["in_app"])  # in_app|browser|web_push|email
    first_fire_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    next_fire_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    recurrence_rule: Mapped[str | None] = mapped_column(String(200))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "notifications"
    # Dedup: a reminder occurrence produces exactly one notification
    __table_args__ = (UniqueConstraint("dedup_key", name="uq_notification_dedup"),)
    reminder_id: Mapped[uuid.UUID | None] = fk("reminders.id", ondelete="CASCADE")
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str | None] = mapped_column(String(300))
    dedup_key: Mapped[str] = mapped_column(String(200))
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class NotificationDelivery(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "notification_deliveries"
    __table_args__ = (UniqueConstraint("notification_id", "channel", name="uq_delivery_channel"),)
    notification_id: Mapped[uuid.UUID] = fk("notifications.id", nullable=False, ondelete="CASCADE")
    channel: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|sent|failed|skipped
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PushSubscription(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "push_subscriptions"
    endpoint: Mapped[str] = mapped_column(String(600), unique=True)
    keys: Mapped[dict] = mapped_column(JSON)
