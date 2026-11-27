import json
import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import DB, CurrentUser, get_owned
from app.core.ratelimit import check_limit
from app.core.time import utcnow
from app.models import AIConversation, AIMessage, AIToolAction
from app.schemas.more import AIActionRead, AIChatIn, AIConversationRead, AIMessageRead
from app.services.ai import (MODE_PROMPTS, SYSTEM, TOOL_NAMES, AINotConfigured, AIProviderError, Provider,
                             build_context, get_provider, is_configured, provider_name)

router = APIRouter(prefix="/ai", tags=["ai"])


def provider_dep() -> Provider:
    return get_provider()


@router.get("/status")
def status(user: CurrentUser):
    return {"enabled": user.settings.ai_enabled, "configured": is_configured(), "provider": provider_name(),
            "context": user.settings.ai_context}


@router.get("/conversations", response_model=list[AIConversationRead])
def conversations(db: DB, user: CurrentUser):
    return db.scalars(select(AIConversation).where(AIConversation.user_id == user.id)
                      .order_by(AIConversation.updated_at.desc())).all()


@router.get("/conversations/{cid}")
def conversation(cid: uuid.UUID, db: DB, user: CurrentUser):
    c = get_owned(db, AIConversation, cid, user)
    msgs = db.scalars(select(AIMessage).where(AIMessage.conversation_id == c.id).order_by(AIMessage.created_at))
    acts = db.scalars(select(AIToolAction).where(AIToolAction.conversation_id == c.id)
                      .order_by(AIToolAction.created_at))
    return {"conversation": AIConversationRead.model_validate(c),
            "messages": [AIMessageRead.model_validate(m) for m in msgs],
            "actions": [AIActionRead.model_validate(a) for a in acts]}


@router.delete("/conversations/{cid}", status_code=204)
def delete_conversation(cid: uuid.UUID, db: DB, user: CurrentUser):
    db.delete(get_owned(db, AIConversation, cid, user))
    db.commit()
    return Response(status_code=204)


@router.post("/chat")
def chat(payload: AIChatIn, db: DB, user: CurrentUser, provider: Provider = Depends(provider_dep)):
    if not user.settings.ai_enabled:
        raise HTTPException(403, "AI отключён в настройках")
    check_limit(f"rl:ai:{user.id}", settings.rate_limit_ai)
    if payload.conversation_id:
        conv = get_owned(db, AIConversation, payload.conversation_id, user)
    else:
        conv = AIConversation(user_id=user.id, title=payload.message[:60])
        db.add(conv)
        db.flush()
    history = db.scalars(select(AIMessage).where(AIMessage.conversation_id == conv.id)
                         .order_by(AIMessage.created_at.desc()).limit(20)).all()[::-1]
    ctx = build_context(db, user)
    system = SYSTEM.format(lang=user.profile.language, today=ctx["today"], tz=ctx["timezone"])
    mode = MODE_PROMPTS.get(payload.mode, "")
    user_text = (f"{mode}\n\n" if mode else "") + payload.message
    messages = [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": f"CONTEXT:\n{json.dumps(ctx, ensure_ascii=False)}\n\n{user_text}"})
    try:
        result = provider.complete(system, messages)
    except AINotConfigured as e:
        db.rollback()
        raise HTTPException(503, str(e)) from None
    except AIProviderError as e:
        db.rollback()
        raise HTTPException(502, str(e)) from None
    now = utcnow()
    db.add(AIMessage(user_id=user.id, conversation_id=conv.id, role="user", content=payload.message, created_at=now))
    reply_text = result.text or ("Предлагаю действия ниже — подтвердите нужные." if result.tool_calls else "")
    reply = AIMessage(user_id=user.id, conversation_id=conv.id, role="assistant", content=reply_text,
                      created_at=utcnow())
    db.add(reply)
    db.flush()
    actions = []
    for call in result.tool_calls:
        if call["name"] not in TOOL_NAMES:
            continue
        a = AIToolAction(user_id=user.id, conversation_id=conv.id, message_id=reply.id, tool=call["name"],
                         arguments=call.get("arguments") or {}, status="pending")
        db.add(a)
        actions.append(a)
    conv.updated_at = utcnow()
    db.commit()
    return {"conversation_id": str(conv.id), "message": AIMessageRead.model_validate(reply),
            "actions": [AIActionRead.model_validate(a) for a in actions]}


def _apply(db, user, a: AIToolAction) -> uuid.UUID:
    """Executes a confirmed action through the same validated code paths as the regular API."""
    args = a.arguments or {}
    if a.tool == "create_task":
        from app.api.v1.tasks import create_task
        from app.schemas import TaskCreate

        return create_task(TaskCreate(**{k: v for k, v in args.items() if k in TaskCreate.model_fields}), db, user).id
    if a.tool == "create_habit":
        from app.api.v1.habits import create_habit
        from app.schemas import HabitCreate

        data = {k: v for k, v in args.items() if k in HabitCreate.model_fields}
        if data.get("frequency") == "selected_days":
            data["frequency"] = "daily"
        return create_habit(HabitCreate(**data), db, user).id
    if a.tool == "create_goal":
        from app.api.v1.goals import create_goal, create_milestone
        from app.schemas import GoalCreate, MilestoneCreate

        data = {k: v for k, v in args.items() if k in GoalCreate.model_fields}
        if data.get("category") not in GoalCreate.model_fields["category"].annotation.__args__:
            data.pop("category", None)
        g = create_goal(GoalCreate(**data), db, user)
        for i, title in enumerate(args.get("milestones") or []):
            create_milestone(g.id, MilestoneCreate(title=str(title)[:200], position=i), db, user)
        return g.id
    if a.tool == "create_event":
        from app.api.v1.calendar import create_event
        from app.schemas import EventCreate

        return create_event(EventCreate(title=args["title"], description=args.get("description", ""),
                                        starts_at=datetime.fromisoformat(args["starts_at"]),
                                        ends_at=datetime.fromisoformat(args["ends_at"]),
                                        timezone=user.profile.timezone), db, user).id
    if a.tool == "create_study_plan":
        from app.models import Course, Lesson

        c = Course(user_id=user.id, title=str(args["course_title"])[:200], description=args.get("description", ""),
                   weekly_minutes_goal=args.get("weekly_minutes_goal"))
        db.add(c)
        db.flush()
        for i, t in enumerate(args.get("lessons") or []):
            db.add(Lesson(user_id=user.id, course_id=c.id, title=str(t)[:200], position=i))
        return c.id
    if a.tool == "create_flashcards":
        from app.models import Deck, Flashcard

        d = Deck(user_id=user.id, title=str(args["deck_title"])[:200])
        db.add(d)
        db.flush()
        for card in (args.get("cards") or [])[:200]:
            db.add(Flashcard(user_id=user.id, deck_id=d.id, front=str(card["front"])[:5000],
                             back=str(card["back"])[:5000]))
        return d.id
    raise ValueError("Неизвестное действие")


@router.post("/actions/{aid}/confirm", response_model=AIActionRead)
def confirm(aid: uuid.UUID, db: DB, user: CurrentUser):
    a = get_owned(db, AIToolAction, aid, user)
    if a.status != "pending":
        raise HTTPException(409, "Действие уже обработано")
    try:
        entity_id = _apply(db, user, a)
        a.status, a.result_entity_id, a.error = "applied", entity_id, None
    except HTTPException as e:
        db.rollback()
        a = get_owned(db, AIToolAction, aid, user)
        a.status, a.error = "failed", str(e.detail)
    except Exception as e:  # noqa: BLE001 - validation errors from AI arguments
        db.rollback()
        a = get_owned(db, AIToolAction, aid, user)
        a.status, a.error = "failed", str(e)[:500]
    db.commit()
    return a


@router.post("/actions/{aid}/reject", response_model=AIActionRead)
def reject(aid: uuid.UUID, db: DB, user: CurrentUser):
    a = get_owned(db, AIToolAction, aid, user)
    if a.status != "pending":
        raise HTTPException(409, "Действие уже обработано")
    a.status = "rejected"
    db.commit()
    return a


__all__ = ["router", "date"]
