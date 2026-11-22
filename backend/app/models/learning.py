"""Learning center, flashcards (SM-2), books."""
import uuid
from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import Owned, SoftDelete, Timestamps, UUIDPk, fk


class Subject(UUIDPk, Timestamps, SoftDelete, Owned, Base):
    __tablename__ = "subjects"
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(20), default="#0ea5e9")
    area: Mapped[str] = mapped_column(String(80), default="")  # learning direction


class Course(UUIDPk, Timestamps, SoftDelete, Owned, Base):
    __tablename__ = "courses"
    subject_id: Mapped[uuid.UUID | None] = fk("subjects.id")
    goal_id: Mapped[uuid.UUID | None] = fk("goals.id")
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    provider: Mapped[str] = mapped_column(String(120), default="")
    url: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="active")  # planned|active|completed|paused
    target_date: Mapped[date | None] = mapped_column(Date)
    weekly_minutes_goal: Mapped[int | None] = mapped_column(Integer)  # study plan
    path_position: Mapped[int] = mapped_column(Integer, default=0)  # order inside learning path (subject)


class Lesson(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "lessons"
    course_id: Mapped[uuid.UUID] = fk("courses.id", nullable=False, ondelete="CASCADE")
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text, default="")
    position: Mapped[int] = mapped_column(Integer, default=0)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LearningResource(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "learning_resources"
    course_id: Mapped[uuid.UUID | None] = fk("courses.id", ondelete="CASCADE")
    lesson_id: Mapped[uuid.UUID | None] = fk("lessons.id", ondelete="CASCADE")
    kind: Mapped[str] = mapped_column(String(20), default="link")  # link|video|pdf|file|text
    title: Mapped[str] = mapped_column(String(200))
    url: Mapped[str | None] = mapped_column(String(500))
    attachment_id: Mapped[uuid.UUID | None] = fk("attachments.id")


class LearningSession(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "learning_sessions"
    subject_id: Mapped[uuid.UUID | None] = fk("subjects.id")
    course_id: Mapped[uuid.UUID | None] = fk("courses.id")
    lesson_id: Mapped[uuid.UUID | None] = fk("lessons.id")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual | focus


# ---------------------------------------------------------------- Flashcards


class Deck(UUIDPk, Timestamps, SoftDelete, Owned, Base):
    __tablename__ = "decks"
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    course_id: Mapped[uuid.UUID | None] = fk("courses.id")
    new_cards_per_day: Mapped[int] = mapped_column(Integer, default=20)


class Flashcard(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "flashcards"
    deck_id: Mapped[uuid.UUID] = fk("decks.id", nullable=False, ondelete="CASCADE")
    front: Mapped[str] = mapped_column(Text)
    back: Mapped[str] = mapped_column(Text)
    image_attachment_id: Mapped[uuid.UUID | None] = fk("attachments.id")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    # SM-2 state
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=0)
    repetitions: Mapped[int] = mapped_column(Integer, default=0)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)  # None = new card
    lapses: Mapped[int] = mapped_column(Integer, default=0)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class FlashcardReview(UUIDPk, Owned, Base):
    __tablename__ = "flashcard_reviews"
    card_id: Mapped[uuid.UUID] = fk("flashcards.id", nullable=False, ondelete="CASCADE")
    grade: Mapped[int] = mapped_column(Integer)  # 0..5
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    prev_interval: Mapped[int] = mapped_column(Integer)
    new_interval: Mapped[int] = mapped_column(Integer)
    prev_ease: Mapped[float] = mapped_column(Float)
    new_ease: Mapped[float] = mapped_column(Float)


# ---------------------------------------------------------------- Books


class Book(UUIDPk, Timestamps, SoftDelete, Owned, Base):
    __tablename__ = "books"
    title: Mapped[str] = mapped_column(String(300))
    author: Mapped[str] = mapped_column(String(200), default="")
    cover_url: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str] = mapped_column(Text, default="")
    total_pages: Mapped[int | None] = mapped_column(Integer)
    current_page: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="want_to_read", index=True)
    rating: Mapped[int | None] = mapped_column(Integer)
    started_on: Mapped[date | None] = mapped_column(Date)
    finished_on: Mapped[date | None] = mapped_column(Date)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)


class ReadingSession(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "reading_sessions"
    book_id: Mapped[uuid.UUID] = fk("books.id", nullable=False, ondelete="CASCADE")
    read_on: Mapped[date] = mapped_column(Date, index=True)
    pages: Mapped[int] = mapped_column(Integer, default=0)
    minutes: Mapped[int] = mapped_column(Integer, default=0)
    end_page: Mapped[int | None] = mapped_column(Integer)


class BookNote(UUIDPk, Timestamps, Owned, Base):
    __tablename__ = "book_notes"
    book_id: Mapped[uuid.UUID] = fk("books.id", nullable=False, ondelete="CASCADE")
    kind: Mapped[str] = mapped_column(String(10), default="note")  # note | quote
    text: Mapped[str] = mapped_column(Text)
    page: Mapped[int | None] = mapped_column(Integer)
