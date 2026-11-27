import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import Owned, Timestamps, UUIDPk


class User(UUIDPk, Timestamps, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)

    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    settings: Mapped["UserSettings"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")


class Profile(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "profiles"
    __table_args__ = (UniqueConstraint("user_id"),)
    name: Mapped[str] = mapped_column(String(120), default="")
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    bio: Mapped[str] = mapped_column(Text, default="")
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    language: Mapped[str] = mapped_column(String(5), default="ru")
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    user: Mapped[User] = relationship(back_populates="profile")


class UserSettings(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "settings"
    __table_args__ = (UniqueConstraint("user_id"),)
    theme: Mapped[str] = mapped_column(String(10), default="dark")  # dark | light | system
    currency: Mapped[str] = mapped_column(String(3), default="KZT")
    week_start: Mapped[int] = mapped_column(default=1)  # 0=Sun, 1=Mon
    dashboard_layout: Mapped[dict] = mapped_column(JSON, default=dict)
    notification_prefs: Mapped[dict] = mapped_column(JSON, default=dict)
    quiet_hours_start: Mapped[str | None] = mapped_column(String(5))  # "22:00"
    quiet_hours_end: Mapped[str | None] = mapped_column(String(5))
    ai_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    ai_context: Mapped[dict] = mapped_column(JSON, default=dict)  # which modules AI may read
    social_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    gamification_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    reading_goal_yearly: Mapped[int] = mapped_column(default=12)
    categories: Mapped[dict] = mapped_column(JSON, default=dict)
    user: Mapped[User] = relationship(back_populates="settings")


class AuthSession(UUIDPk, Timestamps, Owned, Base):
    """Refresh-token session. Token stored hashed; revocable."""

    __tablename__ = "sessions"
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    ip: Mapped[str] = mapped_column(String(64), default="")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OneTimeToken(UUIDPk, Timestamps, Owned, Base):
    """Email verification and password reset tokens (hashed, single use)."""

    __tablename__ = "one_time_tokens"
    purpose: Mapped[str] = mapped_column(String(20))  # verify_email | reset_password
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Attachment(UUIDPk, Timestamps, Owned, Base):
    """Private uploaded file. Linked polymorphically to an entity (entity_type, entity_id)."""

    __tablename__ = "attachments"
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column()
    storage_key: Mapped[str] = mapped_column(String(255), unique=True)
    entity_type: Mapped[str | None] = mapped_column(String(40), index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)


class Tag(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name"),)
    name: Mapped[str] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(20), default="#64748b")


class ActivityEvent(UUIDPk, Owned, Base):
    """Append-only log of real user events; Analytics and Timeline are computed from domain tables + this log."""

    __tablename__ = "activity_events"
    kind: Mapped[str] = mapped_column(String(50), index=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


__all__ = ["User", "Profile", "UserSettings", "AuthSession", "OneTimeToken", "Attachment", "Tag", "ActivityEvent",
           "ForeignKey"]


class ConnectedAccount(UUIDPk, Timestamps, Owned, Base):
    """External integration (Google Calendar, CalDAV/iCloud). Tokens are encrypted at rest (Fernet, key derived from SECRET_KEY)."""

    __tablename__ = "connected_accounts"
    __table_args__ = (UniqueConstraint("user_id", "provider"),)
    provider: Mapped[str] = mapped_column(String(20))
    external_email: Mapped[str] = mapped_column(String(320), default="")
    access_token_enc: Mapped[str] = mapped_column(Text)
    refresh_token_enc: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    scope: Mapped[str] = mapped_column(Text, default="")
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # provider-specific settings, e.g. CalDAV server/calendar URL, last sync error
    meta: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")


__all__ += ["ConnectedAccount"]
