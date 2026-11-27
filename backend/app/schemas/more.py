"""Schemas: learning, flashcards, books, health, finance, journal, notes, focus, personal tools, social, AI."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas import ORM, Color, Currency, Money, Read, Str200, Text, make_update

Url = Annotated[str, Field(max_length=500, pattern=r"^(https?://|/)")]
Minutes = Annotated[int, Field(ge=0, le=100000)]

# ---------------------------------------------------------------- Learning


class SubjectCreate(BaseModel):
    title: Str200
    description: Text = ""
    color: Color = "#0ea5e9"
    area: Annotated[str, Field(max_length=80)] = ""


SubjectUpdate = make_update(SubjectCreate, "SubjectUpdate")


class SubjectRead(Read, SubjectCreate):
    pass


class CourseCreate(BaseModel):
    subject_id: uuid.UUID | None = None
    goal_id: uuid.UUID | None = None
    title: Str200
    description: Text = ""
    provider: Annotated[str, Field(max_length=120)] = ""
    url: Url | None = None
    status: Literal["planned", "active", "completed", "paused"] = "active"
    target_date: date | None = None
    weekly_minutes_goal: Minutes | None = None
    path_position: int = 0


CourseUpdate = make_update(CourseCreate, "CourseUpdate")


class CourseRead(Read, CourseCreate):
    lessons_total: int = 0
    lessons_done: int = 0
    progress: float = 0
    minutes_studied: int = 0


class LessonCreate(BaseModel):
    course_id: uuid.UUID
    title: Str200
    content: Text = ""
    position: int = 0
    duration_minutes: Minutes | None = None


LessonUpdate = make_update(LessonCreate, "LessonUpdate")


class LessonRead(Read, LessonCreate):
    completed_at: datetime | None


class ResourceCreate(BaseModel):
    course_id: uuid.UUID | None = None
    lesson_id: uuid.UUID | None = None
    kind: Literal["link", "video", "pdf", "file", "text"] = "link"
    title: Str200
    url: Url | None = None
    attachment_id: uuid.UUID | None = None


ResourceUpdate = make_update(ResourceCreate, "ResourceUpdate")


class ResourceRead(Read, ResourceCreate):
    pass


class LearningSessionCreate(BaseModel):
    subject_id: uuid.UUID | None = None
    course_id: uuid.UUID | None = None
    lesson_id: uuid.UUID | None = None
    started_at: datetime
    duration_minutes: Annotated[int, Field(ge=1, le=1440)]
    notes: Text = ""


LearningSessionUpdate = make_update(LearningSessionCreate, "LearningSessionUpdate")


class LearningSessionRead(Read, LearningSessionCreate):
    source: str


# ---------------------------------------------------------------- Flashcards


class DeckCreate(BaseModel):
    title: Str200
    description: Text = ""
    course_id: uuid.UUID | None = None
    new_cards_per_day: Annotated[int, Field(ge=0, le=1000)] = 20


DeckUpdate = make_update(DeckCreate, "DeckUpdate")


class DeckRead(Read, DeckCreate):
    total: int = 0
    due_today: int = 0
    new: int = 0
    learning: int = 0
    review: int = 0
    mastered: int = 0


class CardCreate(BaseModel):
    deck_id: uuid.UUID
    front: Annotated[str, Field(min_length=1, max_length=5000)]
    back: Annotated[str, Field(min_length=1, max_length=5000)]
    image_attachment_id: uuid.UUID | None = None
    tags: list[Annotated[str, Field(max_length=60)]] = []


CardUpdate = make_update(CardCreate, "CardUpdate")


class CardRead(Read, CardCreate):
    ease_factor: float
    interval_days: int
    repetitions: int
    due_date: date | None
    lapses: int
    last_reviewed_at: datetime | None
    stage: str = "new"


class ReviewIn(BaseModel):
    grade: Annotated[int, Field(ge=0, le=5)]


# ---------------------------------------------------------------- Books

BookStatus = Literal["want_to_read", "reading", "paused", "completed"]


class BookCreate(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=300)]
    author: Annotated[str, Field(max_length=200)] = ""
    cover_url: Url | None = None
    description: Text = ""
    total_pages: Annotated[int, Field(ge=1, le=100000)] | None = None
    current_page: Annotated[int, Field(ge=0, le=100000)] = 0
    status: BookStatus = "want_to_read"
    rating: Annotated[int, Field(ge=1, le=5)] | None = None
    started_on: date | None = None
    finished_on: date | None = None
    is_favorite: bool = False


BookUpdate = make_update(BookCreate, "BookUpdate")


class BookRead(Read, BookCreate):
    progress: float = 0


class ReadingSessionCreate(BaseModel):
    read_on: date | None = None
    pages: Annotated[int, Field(ge=0, le=5000)] = 0
    minutes: Annotated[int, Field(ge=0, le=1440)] = 0
    end_page: Annotated[int, Field(ge=0, le=100000)] | None = None


class ReadingSessionRead(Read):
    book_id: uuid.UUID
    read_on: date
    pages: int
    minutes: int
    end_page: int | None


class BookNoteCreate(BaseModel):
    kind: Literal["note", "quote"] = "note"
    text: Annotated[str, Field(min_length=1, max_length=10000)]
    page: Annotated[int, Field(ge=0)] | None = None


class BookNoteRead(Read, BookNoteCreate):
    book_id: uuid.UUID


# ---------------------------------------------------------------- Health


class ExerciseCreate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    muscle_group: Annotated[str, Field(max_length=60)] = ""
    kind: Literal["strength", "cardio", "mobility", "other"] = "strength"
    notes: Text = ""


ExerciseUpdate = make_update(ExerciseCreate, "ExerciseUpdate")


class ExerciseRead(Read, ExerciseCreate):
    pass


class WorkoutPlanCreate(BaseModel):
    title: Str200
    description: Text = ""
    weekdays: list[Annotated[int, Field(ge=0, le=6)]] = []
    exercises: list[dict] = []


WorkoutPlanUpdate = make_update(WorkoutPlanCreate, "WorkoutPlanUpdate")


class WorkoutPlanRead(Read, WorkoutPlanCreate):
    pass


class SetIn(BaseModel):
    exercise_id: uuid.UUID
    set_number: Annotated[int, Field(ge=1, le=100)] = 1
    reps: Annotated[int, Field(ge=0, le=10000)] | None = None
    weight_kg: Annotated[float, Field(ge=0, le=2000)] | None = None
    duration_seconds: Annotated[int, Field(ge=0, le=86400)] | None = None
    distance_km: Annotated[float, Field(ge=0, le=1000)] | None = None


class SetRead(ORM, SetIn):
    id: uuid.UUID


class WorkoutCreate(BaseModel):
    plan_id: uuid.UUID | None = None
    title: Str200
    performed_on: date
    duration_minutes: Annotated[int, Field(ge=0, le=1440)] = 0
    is_rest_day: bool = False
    notes: Text = ""
    sets: list[SetIn] = []


class WorkoutUpdate(BaseModel):
    title: Str200 | None = None
    performed_on: date | None = None
    duration_minutes: Annotated[int, Field(ge=0, le=1440)] | None = None
    is_rest_day: bool | None = None
    notes: Text | None = None
    sets: list[SetIn] | None = None


class WorkoutRead(Read):
    plan_id: uuid.UUID | None
    title: str
    performed_on: date
    duration_minutes: int
    is_rest_day: bool
    notes: str
    sets: list[SetRead] = []


HealthKind = Literal["sleep", "water", "walking", "energy", "mood", "weight"]


class HealthLogCreate(BaseModel):
    kind: HealthKind
    log_date: date
    value: Annotated[float, Field(ge=0, le=1000000)]
    note: Annotated[str, Field(max_length=2000)] = ""

    @field_validator("value")
    @classmethod
    def _range(cls, v, info):
        k = info.data.get("kind")
        limits = {"sleep": 24, "energy": 10, "mood": 10, "weight": 500, "water": 20000, "walking": 200000}
        if k in limits and v > limits[k]:
            raise ValueError(f"Значение для {k} не должно превышать {limits[k]}")
        return v


HealthLogUpdate = make_update(HealthLogCreate, "HealthLogUpdate")


class HealthLogRead(Read, HealthLogCreate):
    pass


# ---------------------------------------------------------------- Finance


class TransactionCreate(BaseModel):
    kind: Literal["income", "expense"]
    amount: Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]
    currency: Currency = "KZT"
    category: Annotated[str, Field(min_length=1, max_length=60)] = "other"
    description: Annotated[str, Field(max_length=300)] = ""
    occurred_on: date
    savings_goal_id: uuid.UUID | None = None


TransactionUpdate = make_update(TransactionCreate, "TransactionUpdate")


class TransactionRead(Read, TransactionCreate):
    subscription_id: uuid.UUID | None


class BudgetCreate(BaseModel):
    category: Annotated[str, Field(min_length=1, max_length=60)]
    month: date
    limit_amount: Money
    currency: Currency = "KZT"

    @field_validator("month")
    @classmethod
    def _first(cls, v):
        return v.replace(day=1) if v else v


BudgetUpdate = make_update(BudgetCreate, "BudgetUpdate")


class BudgetRead(Read, BudgetCreate):
    spent: Decimal = Decimal(0)


class SavingsGoalCreate(BaseModel):
    title: Str200
    target_amount: Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]
    saved_amount: Money = Decimal(0)
    currency: Currency = "KZT"
    deadline: date | None = None
    is_purchase_plan: bool = False


SavingsGoalUpdate = make_update(SavingsGoalCreate, "SavingsGoalUpdate")


class SavingsGoalRead(Read, SavingsGoalCreate):
    pass


class SubscriptionCreate(BaseModel):
    title: Str200
    amount: Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]
    currency: Currency = "KZT"
    category: Annotated[str, Field(max_length=60)] = "subscriptions"
    period: Literal["weekly", "monthly", "yearly"] = "monthly"
    next_payment_on: date
    is_active: bool = True


SubscriptionUpdate = make_update(SubscriptionCreate, "SubscriptionUpdate")


class SubscriptionRead(Read, SubscriptionCreate):
    pass


# ---------------------------------------------------------------- Journal

JournalKind = Literal["daily", "gratitude", "mood", "achievement", "learning", "ideas", "reflection",
                      "morning", "evening", "weekly_review", "monthly_review"]


class JournalCreate(BaseModel):
    kind: JournalKind = "daily"
    title: Annotated[str, Field(max_length=200)] = ""
    body: Text = ""
    entry_date: date
    mood: Annotated[int, Field(ge=1, le=10)] | None = None
    tags: list[Annotated[str, Field(max_length=60)]] = []
    is_private: bool = True
    archived: bool = False
    template_id: uuid.UUID | None = None


JournalUpdate = make_update(JournalCreate, "JournalUpdate")


class JournalRead(Read, JournalCreate):
    pass


class JournalTemplateCreate(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=120)]
    kind: JournalKind = "reflection"
    prompts: list[Annotated[str, Field(max_length=300)]] = []


JournalTemplateUpdate = make_update(JournalTemplateCreate, "JournalTemplateUpdate")


class JournalTemplateRead(Read, JournalTemplateCreate):
    pass


# ---------------------------------------------------------------- Notes


class FolderCreate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    parent_id: uuid.UUID | None = None


FolderUpdate = make_update(FolderCreate, "FolderUpdate")


class FolderRead(Read, FolderCreate):
    pass


class NoteCreate(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=300)]
    content: Annotated[str, Field(max_length=500000)] = ""
    folder_id: uuid.UUID | None = None
    category: Annotated[str, Field(max_length=60)] | None = None
    tags: list[Annotated[str, Field(max_length=60)]] = []
    is_favorite: bool = False
    is_pinned: bool = False
    archived: bool = False
    goal_id: uuid.UUID | None = None
    course_id: uuid.UUID | None = None
    book_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    habit_id: uuid.UUID | None = None


NoteUpdate = make_update(NoteCreate, "NoteUpdate")


class NoteRead(Read, NoteCreate):
    pass


# ---------------------------------------------------------------- Focus


class FocusStartIn(BaseModel):
    kind: Literal["pomodoro", "custom", "deep_work", "study", "work", "break"] = "pomodoro"
    planned_minutes: Annotated[int, Field(ge=1, le=600)] = 25
    task_id: uuid.UUID | None = None
    subject_id: uuid.UUID | None = None
    note: Annotated[str, Field(max_length=2000)] = ""


class FocusRead(Read):
    kind: str
    status: str
    planned_minutes: int
    started_at: datetime
    segment_started_at: datetime | None
    focused_seconds: int
    ended_at: datetime | None
    task_id: uuid.UUID | None
    subject_id: uuid.UUID | None
    note: str
    elapsed_seconds: int = 0


class DistractionIn(BaseModel):
    description: Annotated[str, Field(min_length=1, max_length=300)]
    session_id: uuid.UUID | None = None


class DistractionRead(Read):
    session_id: uuid.UUID | None
    description: str
    occurred_at: datetime


# ---------------------------------------------------------------- Personal tools

WHEEL_AREAS = ("health", "career", "finance", "relationships", "family", "growth", "fun", "environment")


class WheelCreate(BaseModel):
    assessed_on: date
    scores: dict[str, Annotated[int, Field(ge=1, le=10)]]
    note: Annotated[str, Field(max_length=2000)] = ""

    @field_validator("scores")
    @classmethod
    def _areas(cls, v):
        if v is None:
            return v
        if not v or len(v) > 16:
            raise ValueError("Нужно от 1 до 16 областей")
        return v


WheelUpdate = make_update(WheelCreate, "WheelUpdate")


class WheelRead(Read, WheelCreate):
    average: float = 0


class BucketCreate(BaseModel):
    title: Str200
    description: Text = ""
    kind: Literal["wish", "experience", "dream", "goal"] = "dream"
    category: Annotated[str, Field(max_length=60)] = ""
    status: Literal["idea", "planned", "in_progress", "done"] = "idea"
    target_date: date | None = None
    done_on: date | None = None


BucketUpdate = make_update(BucketCreate, "BucketUpdate")


class BucketRead(Read, BucketCreate):
    pass


class VisionBoardCreate(BaseModel):
    title: Str200
    description: Text = ""


VisionBoardUpdate = make_update(VisionBoardCreate, "VisionBoardUpdate")


class VisionBoardRead(Read, VisionBoardCreate):
    pass


class VisionItemCreate(BaseModel):
    board_id: uuid.UUID
    kind: Literal["text", "image", "link", "goal"] = "text"
    content: Annotated[str, Field(max_length=2000)] = ""
    image_url: Url | None = None
    url: Url | None = None
    goal_id: uuid.UUID | None = None
    group_label: Annotated[str, Field(max_length=60)] = ""
    position: int = 0


VisionItemUpdate = make_update(VisionItemCreate, "VisionItemUpdate")


class VisionItemRead(Read, VisionItemCreate):
    pass


class TimelineCreate(BaseModel):
    title: Str200
    description: Text = ""
    occurred_on: date
    kind: Literal["event", "achievement", "goal", "milestone"] = "event"


TimelineUpdate = make_update(TimelineCreate, "TimelineUpdate")


class TimelineRead(Read, TimelineCreate):
    source_type: str | None
    source_id: uuid.UUID | None


class ChallengeCreate(BaseModel):
    title: Str200
    description: Text = ""
    metric: Literal["tasks_done", "habit_checks", "focus_minutes", "learning_minutes", "pages", "workouts"]
    target: Annotated[int, Field(ge=1, le=1000000)]
    start_date: date
    end_date: date
    group_id: uuid.UUID | None = None
    xp_reward: Annotated[int, Field(ge=0, le=1000)] = 100


class ChallengeRead(Read, ChallengeCreate):
    value: int = 0
    completed_at: datetime | None = None
    is_owner: bool = True


# ---------------------------------------------------------------- AI


class AIChatIn(BaseModel):
    conversation_id: uuid.UUID | None = None
    message: Annotated[str, Field(min_length=1, max_length=8000)]
    mode: Literal["chat", "plan_day", "plan_week", "analyze_goals", "decompose_goal", "suggest_habits",
                  "analyze_tasks", "study_plan", "flashcards", "quiz", "weekly_report", "monthly_report",
                  "journal_help"] = "chat"


class AIMessageRead(ORM):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class AIActionRead(Read):
    conversation_id: uuid.UUID
    message_id: uuid.UUID | None
    tool: str
    arguments: dict
    status: str
    result_entity_id: uuid.UUID | None
    error: str | None


class AIConversationRead(Read):
    title: str


# ---------------------------------------------------------------- Projects

ProjectStatus = Literal["idea", "planned", "in_progress", "done"]


class ProjectCreate(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    description: Annotated[str, Field(max_length=20000)] = ""
    status: ProjectStatus = "planned"
    priority: Annotated[int, Field(ge=1, le=3)] = 2
    color: Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")] = "#8b7cf6"
    deadline: date | None = None
    position: float = 0
    goal_id: uuid.UUID | None = None


class ProjectUpdate(make_update(ProjectCreate, "_PU")):
    archived: bool | None = None


class ProjectRead(Read):
    title: str
    description: str
    status: str
    priority: int
    color: str
    deadline: date | None
    position: float
    goal_id: uuid.UUID | None
    archived: bool
    completed_at: datetime | None
    tasks_total: int = 0
    tasks_done: int = 0
    progress: float = 0
    notes_count: int = 0
