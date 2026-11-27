"""Request/response schemas. Update schemas are derived from Create schemas (all fields optional),
so validation rules are defined once."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, create_model, field_validator

from app.core.time import is_valid_tz
from app.services.recurrence import validate_rrule

Str200 = Annotated[str, Field(min_length=1, max_length=200)]
Text = Annotated[str, Field(max_length=50000)]
Color = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]
HHMM = Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
Currency = Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
Money = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Read(ORM):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


def _allows_none(annotation) -> bool:
    import types
    import typing

    origin = typing.get_origin(annotation)
    if origin in (typing.Union, types.UnionType):
        return type(None) in typing.get_args(annotation)
    return annotation is type(None)


def make_update(create: type[BaseModel], name: str) -> type[BaseModel]:
    """PATCH schema: every field optional, same constraints and validators as Create.
    Explicit null is rejected for fields that are not nullable in Create."""
    fields = {}
    non_nullable = set()
    for k, v in create.model_fields.items():
        ann = Annotated[(v.annotation, *v.metadata)] if v.metadata else v.annotation
        if not _allows_none(v.annotation):
            non_nullable.add(k)
        fields[k] = (Optional[ann], None)

    def _no_null(self):
        for k in self.model_fields_set:
            if k in non_nullable and getattr(self, k) is None:
                raise ValueError(f"Поле {k} не может быть null")
        return self

    from pydantic import model_validator

    validators = {"_no_null": model_validator(mode="after")(_no_null)}
    return create_model(name, __base__=create, __validators__=validators, **fields)


class RRuleMixin(BaseModel):
    @field_validator("recurrence_rule", check_fields=False)
    @classmethod
    def _rrule(cls, v):
        return validate_rrule(v) if v else None


class TZMixin(BaseModel):
    @field_validator("timezone", check_fields=False)
    @classmethod
    def _tz(cls, v):
        if v is not None and not is_valid_tz(v):
            raise ValueError("Неизвестный часовой пояс")
        return v


# ================================================================ Auth / profile / settings


class RegisterIn(BaseModel):
    email: Annotated[str, Field(max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    password: Annotated[str, Field(min_length=8, max_length=128)]
    name: Annotated[str, Field(min_length=1, max_length=120)]
    timezone: str = "UTC"
    language: Literal["ru", "kk", "en"] = "ru"

    @field_validator("email")
    @classmethod
    def _lower(cls, v):
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def _strength(cls, v):
        if not any(c.isdigit() for c in v) or not any(c.isalpha() for c in v):
            raise ValueError("Пароль должен содержать буквы и цифры")
        return v

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v):
        return v if is_valid_tz(v) else "UTC"


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _lower(cls, v):
        return v.strip().lower()


class EmailIn(BaseModel):
    email: str


class TokenIn(BaseModel):
    token: Annotated[str, Field(min_length=10, max_length=200)]


class ResetIn(TokenIn):
    password: Annotated[str, Field(min_length=8, max_length=128)]


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: Annotated[str, Field(min_length=8, max_length=128)]


class ProfileRead(ORM):
    name: str
    avatar_url: str | None
    bio: str
    timezone: str
    language: str
    is_public: bool


class ProfileUpdate(TZMixin):
    name: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    avatar_url: Annotated[str, Field(max_length=500)] | None = None
    bio: Annotated[str, Field(max_length=2000)] | None = None
    timezone: str | None = None
    language: Literal["ru", "kk", "en"] | None = None
    is_public: bool | None = None


class SettingsRead(ORM):
    theme: str
    currency: str
    week_start: int
    dashboard_layout: dict
    notification_prefs: dict
    quiet_hours_start: str | None
    quiet_hours_end: str | None
    ai_enabled: bool
    ai_context: dict
    social_enabled: bool
    gamification_enabled: bool
    reading_goal_yearly: int
    categories: dict
    cosmetics: dict = {}
    preferences: dict = {}


class SettingsUpdate(BaseModel):
    theme: Literal["dark", "light", "system"] | None = None
    currency: Currency | None = None
    week_start: Annotated[int, Field(ge=0, le=1)] | None = None
    dashboard_layout: dict | None = None
    notification_prefs: dict | None = None
    quiet_hours_start: HHMM | None = None
    quiet_hours_end: HHMM | None = None
    ai_enabled: bool | None = None
    ai_context: dict | None = None
    social_enabled: bool | None = None
    gamification_enabled: bool | None = None
    reading_goal_yearly: Annotated[int, Field(ge=0, le=1000)] | None = None
    categories: dict | None = None
    preferences: dict | None = None


class MeRead(BaseModel):
    id: uuid.UUID
    email: str
    email_verified: bool
    created_at: datetime
    profile: ProfileRead
    settings: SettingsRead


class SessionRead(ORM):
    id: uuid.UUID
    user_agent: str
    ip: str
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime
    current: bool = False


# ================================================================ Goals

GoalCategory = Literal["education", "career", "finance", "health", "fitness", "intelligence",
                       "personal_development", "social", "creativity", "technology", "languages", "custom",
                       "relationships", "projects"]


class GoalCreate(BaseModel):
    title: Str200
    description: Text = ""
    category: GoalCategory = "personal_development"
    priority: Annotated[int, Field(ge=1, le=3)] = 2
    start_date: date | None = None
    deadline: date | None = None
    metric_name: Annotated[str, Field(max_length=80)] | None = None
    metric_target: float | None = None
    metric_current: float | None = None
    notes: Text = ""


class GoalUpdate(make_update(GoalCreate, "_GU")):
    status: Literal["active", "completed", "archived"] | None = None


class MilestoneCreate(BaseModel):
    title: Str200
    due_date: date | None = None
    position: int = 0


MilestoneUpdate = make_update(MilestoneCreate, "MilestoneUpdate")


class MilestoneRead(Read):
    goal_id: uuid.UUID
    title: str
    due_date: date | None
    position: int
    completed_at: datetime | None
    tasks_total: int = 0
    tasks_done: int = 0
    progress: float = 0


class GoalRead(Read):
    title: str
    description: str
    category: str
    priority: int
    status: str
    start_date: date | None
    deadline: date | None
    metric_name: str | None
    metric_target: float | None
    metric_current: float | None
    notes: str
    completed_at: datetime | None
    progress: float = 0


class GoalDetail(GoalRead):
    milestones: list[MilestoneRead] = []
    habits: list[dict] = []
    events: list[dict] = []
    notes_linked: list[dict] = []
    tasks: list[dict] = []
    projects: list[dict] = []
    history: list[dict] = []


# ================================================================ Tasks

TaskStatus = Literal["backlog", "todo", "in_progress", "done", "cancelled"]


class ChecklistItemIn(BaseModel):
    text: Annotated[str, Field(min_length=1, max_length=300)]
    done: bool = False


class ChecklistItemRead(ORM):
    id: uuid.UUID
    text: str
    done: bool
    position: int


class TaskCreate(RRuleMixin):
    title: Annotated[str, Field(min_length=1, max_length=300)]
    description: Text = ""
    status: TaskStatus = "todo"
    priority: Annotated[int, Field(ge=1, le=4)] = 2
    category: Annotated[str, Field(max_length=40)] | None = None
    due_at: datetime | None = None
    estimated_minutes: Annotated[int, Field(ge=0, le=100000)] | None = None
    recurrence_rule: str | None = None
    parent_id: uuid.UUID | None = None
    goal_id: uuid.UUID | None = None
    milestone_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    is_template: bool = False
    tags: list[Annotated[str, Field(min_length=1, max_length=60)]] = []
    checklist: list[ChecklistItemIn] = []


class TaskUpdate(make_update(TaskCreate, "_TU")):
    actual_minutes: Annotated[int, Field(ge=0)] | None = None
    position: float | None = None
    archived: bool | None = None


class TaskRead(Read):
    title: str
    description: str
    status: str
    priority: int
    category: str | None
    due_at: datetime | None
    estimated_minutes: int | None
    actual_minutes: int
    position: float
    recurrence_rule: str | None
    parent_id: uuid.UUID | None
    goal_id: uuid.UUID | None
    milestone_id: uuid.UUID | None
    project_id: uuid.UUID | None = None
    is_template: bool
    archived: bool
    completed_at: datetime | None
    tags: list[str] = []
    checklist: list[ChecklistItemRead] = []
    depends_on: list[uuid.UUID] = []
    blocked: bool = False
    subtasks_total: int = 0
    subtasks_done: int = 0

    @field_validator("tags", mode="before")
    @classmethod
    def _tags(cls, v):
        return [t if isinstance(t, str) else t.name for t in (v or [])]


class BulkTaskIn(BaseModel):
    ids: Annotated[list[uuid.UUID], Field(min_length=1, max_length=500)]
    action: Literal["status", "priority", "archive", "delete", "move"]
    status: TaskStatus | None = None
    priority: Annotated[int, Field(ge=1, le=4)] | None = None
    goal_id: uuid.UUID | None = None


class MoveTaskIn(BaseModel):
    status: TaskStatus
    position: float


class CommentIn(BaseModel):
    body: Annotated[str, Field(min_length=1, max_length=5000)]


class DependencyIn(BaseModel):
    depends_on_id: uuid.UUID


# ================================================================ Habits


class HabitCreate(BaseModel):
    title: Str200
    description: Text = ""
    category: Annotated[str, Field(max_length=40)] | None = None
    icon: Annotated[str, Field(max_length=40)] = "check"
    color: Color = "#22c55e"
    kind: Literal["boolean", "numeric", "duration"] = "boolean"
    frequency: Literal["daily", "weekly", "selected_days", "monthly", "custom"] = "daily"
    schedule: dict = {}
    target: Annotated[float, Field(gt=0, le=100000)] = 1
    unit: Annotated[str, Field(max_length=20)] | None = None
    allow_multiple_per_day: bool = False
    reminder_time: HHMM | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool = True
    goal_id: uuid.UUID | None = None

    @field_validator("schedule")
    @classmethod
    def _sched(cls, v):
        if v is None:
            return v
        wd = v.get("weekdays")
        if wd is not None and (not isinstance(wd, list) or any(not isinstance(x, int) or not 0 <= x <= 6 for x in wd)):
            raise ValueError("weekdays: список чисел 0..6")
        for k in ("times_per_period", "interval_days"):
            if k in v and (not isinstance(v[k], int) or v[k] < 1 or v[k] > 365):
                raise ValueError(f"{k}: число 1..365")
        return v


HabitUpdate = make_update(HabitCreate, "HabitUpdate")


class HabitRead(Read):
    title: str
    description: str
    category: str | None
    icon: str
    color: str
    kind: str
    frequency: str
    schedule: dict
    target: float
    unit: str | None
    allow_multiple_per_day: bool
    reminder_time: str | None
    start_date: date
    end_date: date | None
    is_active: bool
    goal_id: uuid.UUID | None
    today_value: float = 0
    today_status: str | None = None
    scheduled_today: bool = True
    current_streak: int = 0


class HabitCheckIn(BaseModel):
    log_date: date | None = None
    value: Annotated[float, Field(ge=0, le=100000)] | None = None
    status: Literal["done", "skipped"] = "done"
    note: Annotated[str, Field(max_length=2000)] = ""


class HabitLogRead(ORM):
    id: uuid.UUID
    habit_id: uuid.UUID
    log_date: date
    value: float
    status: str
    note: str


# ================================================================ Calendar


class EventCreate(RRuleMixin, TZMixin):
    title: Str200
    description: Text = ""
    location: Annotated[str, Field(max_length=200)] = ""
    category: Annotated[str, Field(max_length=40)] = "general"
    color: Color = "#6366f1"
    starts_at: datetime
    ends_at: datetime
    all_day: bool = False
    timezone: str = "UTC"
    recurrence_rule: str | None = None
    is_time_block: bool = False
    task_id: uuid.UUID | None = None
    goal_id: uuid.UUID | None = None
    habit_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    reminder_minutes_before: list[Annotated[int, Field(ge=0, le=40320)]] = []

    @field_validator("starts_at", "ends_at")
    @classmethod
    def _aware(cls, v):
        if v is not None and v.tzinfo is None:
            raise ValueError("Дата должна содержать часовой пояс (ISO 8601 с offset)")
        return v


EventUpdate = make_update(EventCreate, "EventUpdate")


class EventRead(Read):
    title: str
    description: str
    location: str
    category: str
    color: str
    starts_at: datetime
    ends_at: datetime
    all_day: bool
    timezone: str
    recurrence_rule: str | None
    is_time_block: bool
    task_id: uuid.UUID | None
    goal_id: uuid.UUID | None
    habit_id: uuid.UUID | None
    project_id: uuid.UUID | None = None
    completed_at: datetime | None = None
    external_source: str | None


class EventOccurrence(BaseModel):
    event_id: uuid.UUID
    title: str
    starts_at: datetime
    ends_at: datetime
    all_day: bool
    color: str
    category: str
    is_recurring: bool
    is_time_block: bool
    task_id: uuid.UUID | None
    goal_id: uuid.UUID | None
    habit_id: uuid.UUID | None
    project_id: uuid.UUID | None = None
    done: bool = False
    external_source: str | None = None


# ================================================================ Reminders / notifications

ReminderKind = Literal["task", "habit", "goal", "event", "learning", "workout", "payment", "daily_review",
                       "weekly_review", "custom"]
Channel = Literal["in_app", "browser", "web_push", "email"]


class ReminderCreate(RRuleMixin, TZMixin):
    kind: ReminderKind = "custom"
    title: Str200
    body: Annotated[str, Field(max_length=2000)] = ""
    entity_type: Annotated[str, Field(max_length=40)] | None = None
    entity_id: uuid.UUID | None = None
    channels: Annotated[list[Channel], Field(min_length=1)] = ["in_app"]
    first_fire_at: datetime
    recurrence_rule: str | None = None
    timezone: str = "UTC"
    is_active: bool = True


ReminderUpdate = make_update(ReminderCreate, "ReminderUpdate")


class ReminderRead(Read):
    kind: str
    title: str
    body: str
    entity_type: str | None
    entity_id: uuid.UUID | None
    channels: list[str]
    first_fire_at: datetime
    next_fire_at: datetime | None
    recurrence_rule: str | None
    timezone: str
    is_active: bool
    last_fired_at: datetime | None


class SnoozeIn(BaseModel):
    minutes: Annotated[int, Field(ge=1, le=10080)] = 10


class RescheduleIn(BaseModel):
    fire_at: datetime


class NotificationRead(Read):
    reminder_id: uuid.UUID | None
    title: str
    body: str
    link: str | None
    read_at: datetime | None


class DeliveryRead(Read):
    notification_id: uuid.UUID
    channel: str
    status: str
    attempts: int
    last_error: str | None
    next_attempt_at: datetime | None
    sent_at: datetime | None


class PushSubIn(BaseModel):
    endpoint: Annotated[str, Field(max_length=600, pattern=r"^https://")]
    keys: dict
