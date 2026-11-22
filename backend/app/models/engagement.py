"""Gamification, AI, social, personal development tools."""
import uuid
from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import Owned, Timestamps, UUIDPk, fk

# ---------------------------------------------------------------- Gamification


class XPTransaction(UUIDPk, Owned, Base):
    """Idempotency: (user_id, idempotency_key) is unique, so the same real action can never award XP twice.
    Corrections are separate negative rows (reason='correction:...')."""

    __tablename__ = "xp_transactions"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key", name="uq_xp_idem"),)
    amount: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(60))
    source_type: Mapped[str] = mapped_column(String(40))
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    idempotency_key: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Achievement(UUIDPk, Timestamps, Base):
    """Global catalogue (seeded). condition = {"metric": "...", "gte": N}."""

    __tablename__ = "achievements"
    code: Mapped[str] = mapped_column(String(60), unique=True)
    title_ru: Mapped[str] = mapped_column(String(120))
    title_en: Mapped[str] = mapped_column(String(120))
    description_ru: Mapped[str] = mapped_column(String(300))
    icon: Mapped[str] = mapped_column(String(40), default="award")
    xp_reward: Mapped[int] = mapped_column(Integer, default=50)
    condition: Mapped[dict] = mapped_column(JSON)


class UserAchievement(UUIDPk, Owned, Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_id"),)
    achievement_id: Mapped[uuid.UUID] = fk("achievements.id", nullable=False, ondelete="CASCADE")
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)


class Challenge(UUIDPk, Timestamps, Owned, Base):
    """Personal or group challenge. metric is computed from real data (e.g. habit completions, focus minutes)."""

    __tablename__ = "challenges"
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    metric: Mapped[str] = mapped_column(String(40))  # tasks_done|habit_checks|focus_minutes|learning_minutes|pages
    target: Mapped[int] = mapped_column(Integer)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    group_id: Mapped[uuid.UUID | None] = fk("groups.id", ondelete="CASCADE")
    xp_reward: Mapped[int] = mapped_column(Integer, default=100)


class ChallengeProgress(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "challenge_progress"
    __table_args__ = (UniqueConstraint("challenge_id", "user_id"),)
    challenge_id: Mapped[uuid.UUID] = fk("challenges.id", nullable=False, ondelete="CASCADE")
    value: Mapped[int] = mapped_column(Integer, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------- AI


class AIConversation(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "ai_conversations"
    title: Mapped[str] = mapped_column(String(200), default="Новый диалог")


class AIMessage(UUIDPk, Owned, Base):
    __tablename__ = "ai_messages"
    conversation_id: Mapped[uuid.UUID] = fk("ai_conversations.id", nullable=False, ondelete="CASCADE")
    role: Mapped[str] = mapped_column(String(10))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class AIToolAction(UUIDPk, Timestamps, Owned, Base):
    """Proposed change from the AI. Applied ONLY after the user confirms."""

    __tablename__ = "ai_tool_actions"
    conversation_id: Mapped[uuid.UUID] = fk("ai_conversations.id", nullable=False, ondelete="CASCADE")
    message_id: Mapped[uuid.UUID | None] = fk("ai_messages.id", ondelete="CASCADE")
    tool: Mapped[str] = mapped_column(String(40))  # create_task|create_habit|create_goal|create_event|create_study_plan
    arguments: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|applied|rejected|failed
    result_entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    error: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------- Social


class Friendship(UUIDPk, Timestamps, Base):
    """requester -> addressee. status: pending | accepted | blocked (blocked_by = who blocked)."""

    __tablename__ = "friendships"
    __table_args__ = (UniqueConstraint("requester_id", "addressee_id"),)
    requester_id: Mapped[uuid.UUID] = fk("users.id", nullable=False, ondelete="CASCADE")
    addressee_id: Mapped[uuid.UUID] = fk("users.id", nullable=False, ondelete="CASCADE")
    status: Mapped[str] = mapped_column(String(10), default="pending")
    blocked_by: Mapped[uuid.UUID | None] = fk("users.id", ondelete="CASCADE")


class Group(UUIDPk, Timestamps, Base):
    __tablename__ = "groups"
    owner_id: Mapped[uuid.UUID] = fk("users.id", nullable=False, ondelete="CASCADE")
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")


class GroupMember(UUIDPk, Timestamps, Base):
    __tablename__ = "group_members"
    __table_args__ = (UniqueConstraint("group_id", "user_id"),)
    group_id: Mapped[uuid.UUID] = fk("groups.id", nullable=False, ondelete="CASCADE")
    user_id: Mapped[uuid.UUID] = fk("users.id", nullable=False, ondelete="CASCADE")
    role: Mapped[str] = mapped_column(String(10), default="member")


class SharedGoal(UUIDPk, Timestamps, Base):
    __tablename__ = "shared_goals"
    __table_args__ = (UniqueConstraint("goal_id", "shared_with_id"),)
    goal_id: Mapped[uuid.UUID] = fk("goals.id", nullable=False, ondelete="CASCADE")
    owner_id: Mapped[uuid.UUID] = fk("users.id", nullable=False, ondelete="CASCADE")
    shared_with_id: Mapped[uuid.UUID] = fk("users.id", nullable=False, ondelete="CASCADE")


# ---------------------------------------------------------------- Personal development tools


class WheelOfLifeEntry(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "wheel_of_life_entries"
    assessed_on: Mapped[date] = mapped_column(Date, index=True)
    scores: Mapped[dict] = mapped_column(JSON)  # {"health": 7, "career": 5, ...} each 1..10
    note: Mapped[str] = mapped_column(Text, default="")


class BucketListItem(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "bucket_list_items"
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(20), default="dream")  # wish|experience|dream|goal
    category: Mapped[str] = mapped_column(String(60), default="")
    status: Mapped[str] = mapped_column(String(20), default="idea")  # idea|planned|in_progress|done
    target_date: Mapped[date | None] = mapped_column(Date)
    done_on: Mapped[date | None] = mapped_column(Date)


class VisionBoard(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "vision_boards"
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")


class VisionBoardItem(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "vision_board_items"
    board_id: Mapped[uuid.UUID] = fk("vision_boards.id", nullable=False, ondelete="CASCADE")
    kind: Mapped[str] = mapped_column(String(10), default="text")  # text|image|link|goal
    content: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str | None] = mapped_column(String(500))
    url: Mapped[str | None] = mapped_column(String(500))
    goal_id: Mapped[uuid.UUID | None] = fk("goals.id", ondelete="SET NULL")
    group_label: Mapped[str] = mapped_column(String(60), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)


class LifeTimelineEvent(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "life_timeline_events"
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    occurred_on: Mapped[date] = mapped_column(Date, index=True)
    kind: Mapped[str] = mapped_column(String(20), default="event")  # event|achievement|goal|milestone
    source_type: Mapped[str | None] = mapped_column(String(40))
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
