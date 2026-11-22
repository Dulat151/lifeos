"""LLM integration (server side only). Providers: Anthropic (default) or OpenAI.

The model never writes to the database. It can only *propose* actions through tools; each proposal is stored
as ai_tool_actions(status='pending') and executed only after the user confirms it in the UI.
Context sent to the model is limited to modules the user allowed in settings.ai_context.
"""
import json
import logging
from dataclasses import dataclass, field
from datetime import timedelta

import httpx
from sqlalchemy import select

from app.core.config import settings
from app.core.time import local_today, user_tz, utcnow

log = logging.getLogger("lifeos.ai")


class AINotConfigured(RuntimeError):
    pass


class AIProviderError(RuntimeError):
    pass


TOOLS = [
    {"name": "create_task", "description": "Предложить создать задачу (требует подтверждения пользователя).",
     "input_schema": {"type": "object", "properties": {
         "title": {"type": "string"}, "description": {"type": "string"},
         "priority": {"type": "integer", "minimum": 1, "maximum": 4},
         "due_at": {"type": "string", "description": "ISO 8601 с часовым поясом"},
         "goal_id": {"type": "string"}}, "required": ["title"]}},
    {"name": "create_habit", "description": "Предложить создать привычку.",
     "input_schema": {"type": "object", "properties": {
         "title": {"type": "string"}, "description": {"type": "string"},
         "frequency": {"type": "string", "enum": ["daily", "weekly", "selected_days", "monthly"]},
         "kind": {"type": "string", "enum": ["boolean", "numeric", "duration"]},
         "target": {"type": "number"}, "unit": {"type": "string"}}, "required": ["title"]}},
    {"name": "create_goal", "description": "Предложить создать цель с этапами.",
     "input_schema": {"type": "object", "properties": {
         "title": {"type": "string"}, "description": {"type": "string"},
         "category": {"type": "string"}, "deadline": {"type": "string", "description": "YYYY-MM-DD"},
         "milestones": {"type": "array", "items": {"type": "string"}}}, "required": ["title"]}},
    {"name": "create_event", "description": "Предложить добавить событие в календарь.",
     "input_schema": {"type": "object", "properties": {
         "title": {"type": "string"}, "starts_at": {"type": "string"}, "ends_at": {"type": "string"},
         "description": {"type": "string"}}, "required": ["title", "starts_at", "ends_at"]}},
    {"name": "create_study_plan", "description": "Предложить учебный план: курс с уроками.",
     "input_schema": {"type": "object", "properties": {
         "course_title": {"type": "string"}, "description": {"type": "string"},
         "weekly_minutes_goal": {"type": "integer"},
         "lessons": {"type": "array", "items": {"type": "string"}}}, "required": ["course_title", "lessons"]}},
    {"name": "create_flashcards", "description": "Предложить создать колоду карточек.",
     "input_schema": {"type": "object", "properties": {
         "deck_title": {"type": "string"},
         "cards": {"type": "array", "items": {"type": "object", "properties": {
             "front": {"type": "string"}, "back": {"type": "string"}}, "required": ["front", "back"]}}},
         "required": ["deck_title", "cards"]}},
]
TOOL_NAMES = {t["name"] for t in TOOLS}

MODE_PROMPTS = {
    "chat": "",
    "plan_day": "Составь реалистичный план на сегодня на основе задач, событий и привычек пользователя.",
    "plan_week": "Составь план на неделю на основе целей, задач и календаря.",
    "analyze_goals": "Проанализируй цели пользователя и их прогресс, укажи риски и следующие шаги.",
    "decompose_goal": "Разбей цель на этапы и конкретные задачи; предложи их через инструменты.",
    "suggest_habits": "Предложи 3-5 привычек, поддерживающих цели пользователя.",
    "analyze_tasks": "Проанализируй задачи: приоритеты, просрочки, перегрузку.",
    "study_plan": "Создай учебный план и предложи его через create_study_plan.",
    "flashcards": "Сгенерируй учебные карточки по теме и предложи их через create_flashcards.",
    "quiz": "Составь тест с вариантами ответов по теме, ответы в конце.",
    "weekly_report": "Сделай еженедельный отчёт строго по предоставленным данным.",
    "monthly_report": "Сделай ежемесячный отчёт строго по предоставленным данным.",
    "journal_help": "Помоги с рефлексией: задай вопросы, предложи структуру записи.",
}

SYSTEM = (
    "Ты — AI-ассистент LIFE OS, персональной системы саморазвития. Отвечай на языке пользователя ({lang}). "
    "Используй ТОЛЬКО данные из блока CONTEXT; если данных нет — так и скажи, не выдумывай статистику и факты. "
    "Изменять данные ты не можешь: чтобы что-то создать, вызови инструмент — пользователь подтвердит. "
    "Не ставь медицинских диагнозов и не давай опасных рекомендаций. Сегодня {today}, часовой пояс {tz}."
)


@dataclass
class LLMResult:
    text: str
    tool_calls: list[dict] = field(default_factory=list)


def build_context(db, user) -> dict:
    from app.api.v1.goals import goal_progress
    from app.models import CalendarEvent, Course, Goal, Habit, JournalEntry, Task, Workout

    allow = user.settings.ai_context or {}
    today = local_today(user)
    ctx: dict = {"today": today.isoformat(), "timezone": user.profile.timezone}
    if allow.get("goals"):
        ctx["goals"] = [{"id": str(g.id), "title": g.title, "category": g.category, "deadline": str(g.deadline),
                         "progress": goal_progress(db, g)} for g in db.scalars(select(Goal).where(
                            Goal.user_id == user.id, Goal.deleted_at.is_(None), Goal.status == "active").limit(20))]
    if allow.get("tasks"):
        ctx["open_tasks"] = [{"title": t.title, "priority": t.priority, "status": t.status,
                              "due_at": t.due_at.isoformat() if t.due_at else None} for t in db.scalars(
            select(Task).where(Task.user_id == user.id, Task.deleted_at.is_(None), Task.is_template.is_(False),
                               Task.status.notin_(("done", "cancelled"))).order_by(Task.due_at.asc().nulls_last())
            .limit(40))]
    if allow.get("habits"):
        from app.api.v1.habits import _read

        ctx["habits"] = [{"title": h.title, "frequency": h.frequency, "streak": r.current_streak,
                          "today": r.today_status} for h in db.scalars(select(Habit).where(
                            Habit.user_id == user.id, Habit.deleted_at.is_(None), Habit.is_active.is_(True)).limit(30))
                         for r in [_read(db, user, h, today)]]
    if allow.get("calendar"):
        now = utcnow()
        ctx["events_next_7_days"] = [{"title": e.title, "starts_at": e.starts_at.astimezone(user_tz(user)).isoformat()}
                                     for e in db.scalars(select(CalendarEvent).where(
                                         CalendarEvent.user_id == user.id, CalendarEvent.deleted_at.is_(None),
                                         CalendarEvent.starts_at >= now,
                                         CalendarEvent.starts_at < now + timedelta(days=7)).limit(30))]
    if allow.get("learning"):
        ctx["courses"] = [c.title for c in db.scalars(select(Course).where(
            Course.user_id == user.id, Course.deleted_at.is_(None), Course.status == "active").limit(20))]
    if allow.get("journal"):
        ctx["recent_journal"] = [{"date": e.entry_date.isoformat(), "kind": e.kind, "mood": e.mood,
                                  "text": e.body[:500]} for e in db.scalars(select(JournalEntry).where(
                                    JournalEntry.user_id == user.id, JournalEntry.deleted_at.is_(None))
                                    .order_by(JournalEntry.entry_date.desc()).limit(5))]
    if allow.get("finance"):
        from app.api.v1.life import finance_report

        r = finance_report(db, user)
        ctx["finance_this_month"] = {k: r[k] for k in ("currency", "income", "expense", "balance", "by_category")}
    if allow.get("health"):
        ctx["workouts_last_30_days"] = len(db.scalars(select(Workout.id).where(
            Workout.user_id == user.id, Workout.performed_on >= today - timedelta(days=30))).all())
    if any(k in allow for k in ("tasks", "habits")):
        from app.services.analytics import compute

        a = compute(db, user, today - timedelta(days=6), today)
        ctx["last_7_days_metrics"] = {k: a[k] for k in ("task_completion_rate", "habit_completion_rate",
                                                        "focus_hours", "learning_hours", "productivity_score")}
    return ctx


class Provider:
    def complete(self, system: str, messages: list[dict]) -> LLMResult:  # pragma: no cover - interface
        raise NotImplementedError


class AnthropicProvider(Provider):
    def complete(self, system, messages):
        if not settings.anthropic_api_key:
            raise AINotConfigured("ANTHROPIC_API_KEY не задан на сервере")
        import anthropic

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=60)
        try:
            resp = client.messages.create(model=settings.anthropic_model, max_tokens=2000, system=system,
                                          messages=messages, tools=TOOLS)
        except anthropic.APIError as e:
            raise AIProviderError(f"Ошибка провайдера AI: {getattr(e, 'message', str(e))}") from e
        text = "".join(b.text for b in resp.content if b.type == "text")
        calls = [{"name": b.name, "arguments": b.input} for b in resp.content if b.type == "tool_use"]
        return LLMResult(text=text, tool_calls=calls)


class OpenAIProvider(Provider):
    def complete(self, system, messages):
        if not settings.openai_api_key:
            raise AINotConfigured("OPENAI_API_KEY не задан на сервере")
        tools = [{"type": "function", "function": {"name": t["name"], "description": t["description"],
                                                   "parameters": t["input_schema"]}} for t in TOOLS]
        try:
            r = httpx.post("https://api.openai.com/v1/chat/completions", timeout=60,
                           headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                           json={"model": settings.openai_model, "tools": tools,
                                 "messages": [{"role": "system", "content": system}, *messages]})
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise AIProviderError(f"Ошибка провайдера AI: {e}") from e
        msg = r.json()["choices"][0]["message"]
        calls = [{"name": c["function"]["name"], "arguments": json.loads(c["function"]["arguments"] or "{}")}
                 for c in msg.get("tool_calls") or []]
        return LLMResult(text=msg.get("content") or "", tool_calls=calls)


def get_provider() -> Provider:
    return OpenAIProvider() if settings.ai_provider == "openai" else AnthropicProvider()


def is_configured() -> bool:
    return bool(settings.openai_api_key if settings.ai_provider == "openai" else settings.anthropic_api_key)
