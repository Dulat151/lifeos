"""Goals and milestones.

Progress formula (documented):
  - goal has milestones: progress = mean(milestone_progress) where
      milestone_progress = 100 if milestone completed, else done_tasks/total_tasks*100 (0 if no tasks)
  - no milestones but linked tasks: done/total (cancelled excluded)
  - else measurable metric: min(metric_current/metric_target, 1)*100
  - completed goals: 100
"""
import uuid
from datetime import date

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import func, select

from app.core.deps import DB, CurrentUser, get_owned
from app.core.time import utcnow
from app.models import CalendarEvent, Goal, GoalHistory, Habit, Milestone, Note, Task
from app.schemas import (GoalCreate, GoalDetail, GoalRead, GoalUpdate, MilestoneCreate, MilestoneRead,
                         MilestoneUpdate)
from app.services import gamification as gm
from app.services.activity import log_event

router = APIRouter(prefix="/goals", tags=["goals"])


def _task_counts(db, user_id, col, ids) -> dict:
    if not ids:
        return {}
    rows = db.execute(
        select(col, func.count().filter(Task.status != "cancelled"), func.count().filter(Task.status == "done"))
        .where(Task.user_id == user_id, col.in_(ids), Task.deleted_at.is_(None), Task.parent_id.is_(None))
        .group_by(col)
    ).all()
    return {r[0]: (r[1], r[2]) for r in rows}


def milestone_reads(db, user_id, milestones) -> list[MilestoneRead]:
    counts = _task_counts(db, user_id, Task.milestone_id, [m.id for m in milestones])
    out = []
    for m in milestones:
        total, done = counts.get(m.id, (0, 0))
        r = MilestoneRead.model_validate(m)
        r.tasks_total, r.tasks_done = total, done
        r.progress = 100.0 if m.completed_at else (round(done / total * 100, 1) if total else 0.0)
        out.append(r)
    return out


def goal_progress(db, goal: Goal) -> float:
    if goal.status == "completed":
        return 100.0
    if goal.milestones:
        ms = milestone_reads(db, goal.user_id, goal.milestones)
        return round(sum(m.progress for m in ms) / len(ms), 1)
    total, done = _task_counts(db, goal.user_id, Task.goal_id, [goal.id]).get(goal.id, (0, 0))
    if total:
        return round(done / total * 100, 1)
    if goal.metric_target:
        return round(min((goal.metric_current or 0) / goal.metric_target, 1) * 100, 1)
    return 0.0


def goal_read(db, g: Goal) -> GoalRead:
    r = GoalRead.model_validate(g)
    r.progress = goal_progress(db, g)
    return r


@router.get("", response_model=list[GoalRead])
def list_goals(db: DB, user: CurrentUser, status: str | None = Query(None), category: str | None = None,
               q: str | None = Query(None, max_length=200)):
    stmt = select(Goal).where(Goal.user_id == user.id, Goal.deleted_at.is_(None))
    if status:
        stmt = stmt.where(Goal.status == status)
    else:
        stmt = stmt.where(Goal.status != "archived")
    if category:
        stmt = stmt.where(Goal.category == category)
    if q:
        stmt = stmt.where(Goal.title.ilike(f"%{q}%"))
    stmt = stmt.order_by(Goal.priority, Goal.deadline.nulls_last(), Goal.created_at.desc())
    return [goal_read(db, g) for g in db.scalars(stmt)]


@router.post("", response_model=GoalRead, status_code=201)
def create_goal(payload: GoalCreate, db: DB, user: CurrentUser):
    if payload.start_date and payload.deadline and payload.deadline < payload.start_date:
        raise HTTPException(422, "Дедлайн раньше даты начала")
    g = Goal(**payload.model_dump(), user_id=user.id)
    db.add(g)
    db.flush()
    log_event(db, user.id, "goal_created", "goal", g.id)
    db.commit()
    return goal_read(db, g)


@router.get("/stats")
def goal_stats(db: DB, user: CurrentUser):
    goals = db.scalars(select(Goal).where(Goal.user_id == user.id, Goal.deleted_at.is_(None))).all()
    by_cat: dict = {}
    for g in goals:
        c = by_cat.setdefault(g.category, {"total": 0, "completed": 0})
        c["total"] += 1
        c["completed"] += g.status == "completed"
    active = [g for g in goals if g.status == "active"]
    today = date.today()
    return {
        "total": len(goals),
        "active": len(active),
        "completed": sum(g.status == "completed" for g in goals),
        "archived": sum(g.status == "archived" for g in goals),
        "overdue": sum(1 for g in active if g.deadline and g.deadline < today),
        "average_progress": round(sum(goal_progress(db, g) for g in active) / len(active), 1) if active else 0,
        "by_category": by_cat,
    }


@router.get("/{goal_id}", response_model=GoalDetail)
def get_goal(goal_id: uuid.UUID, db: DB, user: CurrentUser):
    g = get_owned(db, Goal, goal_id, user)
    d = GoalDetail(**goal_read(db, g).model_dump())
    d.milestones = milestone_reads(db, user.id, g.milestones)
    d.habits = [{"id": str(h.id), "title": h.title, "color": h.color} for h in db.scalars(
        select(Habit).where(Habit.user_id == user.id, Habit.goal_id == g.id, Habit.deleted_at.is_(None)))]
    d.events = [{"id": str(e.id), "title": e.title, "starts_at": e.starts_at.isoformat()} for e in db.scalars(
        select(CalendarEvent).where(CalendarEvent.user_id == user.id, CalendarEvent.goal_id == g.id,
                                    CalendarEvent.deleted_at.is_(None)).order_by(CalendarEvent.starts_at))]
    d.notes_linked = [{"id": str(n.id), "title": n.title} for n in db.scalars(
        select(Note).where(Note.user_id == user.id, Note.goal_id == g.id, Note.deleted_at.is_(None)))]
    d.tasks = [{"id": str(t.id), "title": t.title, "status": t.status,
                "milestone_id": str(t.milestone_id) if t.milestone_id else None,
                "due_at": t.due_at.isoformat() if t.due_at else None}
               for t in db.scalars(select(Task).where(Task.user_id == user.id, Task.goal_id == g.id,
                                                      Task.deleted_at.is_(None)).order_by(Task.created_at))]
    d.history = [{"field": h.field, "old": h.old_value, "new": h.new_value, "at": h.changed_at.isoformat()}
                 for h in db.scalars(select(GoalHistory).where(GoalHistory.goal_id == g.id)
                                     .order_by(GoalHistory.changed_at.desc()).limit(100))]
    return d


@router.patch("/{goal_id}", response_model=GoalRead)
def update_goal(goal_id: uuid.UUID, payload: GoalUpdate, db: DB, user: CurrentUser):
    g = get_owned(db, Goal, goal_id, user)
    data = payload.model_dump(exclude_unset=True)
    now = utcnow()
    for k, v in data.items():
        old = getattr(g, k)
        if old != v:
            db.add(GoalHistory(user_id=user.id, goal_id=g.id, field=k, old_value=None if old is None else str(old),
                               new_value=None if v is None else str(v), changed_at=now))
            setattr(g, k, v)
    if "status" in data:
        if data["status"] == "completed" and not g.completed_at:
            g.completed_at = now
            gm.award(db, user, "goal_completed", "goal", g.id)
            log_event(db, user.id, "goal_completed", "goal", g.id, {"title": g.title})
        elif data["status"] != "completed" and g.completed_at:
            g.completed_at = None
            gm.revoke(db, user, "goal_completed", "goal", g.id)
    if g.start_date and g.deadline and g.deadline < g.start_date:
        raise HTTPException(422, "Дедлайн раньше даты начала")
    db.commit()
    return goal_read(db, g)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: uuid.UUID, db: DB, user: CurrentUser):
    g = get_owned(db, Goal, goal_id, user)
    g.deleted_at = utcnow()
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- milestones


@router.post("/{goal_id}/milestones", response_model=MilestoneRead, status_code=201)
def create_milestone(goal_id: uuid.UUID, payload: MilestoneCreate, db: DB, user: CurrentUser):
    g = get_owned(db, Goal, goal_id, user)
    m = Milestone(**payload.model_dump(), goal_id=g.id, user_id=user.id)
    db.add(m)
    db.commit()
    return milestone_reads(db, user.id, [m])[0]


def _owned_milestone(db, user, goal_id, ms_id) -> Milestone:
    m = db.scalar(select(Milestone).where(Milestone.id == ms_id, Milestone.goal_id == goal_id,
                                          Milestone.user_id == user.id))
    if not m:
        raise HTTPException(404, "Этап не найден")
    return m


@router.patch("/{goal_id}/milestones/{ms_id}", response_model=MilestoneRead)
def update_milestone(goal_id: uuid.UUID, ms_id: uuid.UUID, payload: MilestoneUpdate, db: DB, user: CurrentUser):
    m = _owned_milestone(db, user, goal_id, ms_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    return milestone_reads(db, user.id, [m])[0]


@router.post("/{goal_id}/milestones/{ms_id}/toggle", response_model=MilestoneRead)
def toggle_milestone(goal_id: uuid.UUID, ms_id: uuid.UUID, db: DB, user: CurrentUser):
    m = _owned_milestone(db, user, goal_id, ms_id)
    if m.completed_at:
        m.completed_at = None
        gm.revoke(db, user, "milestone_completed", "milestone", m.id)
    else:
        m.completed_at = utcnow()
        gm.award(db, user, "milestone_completed", "milestone", m.id)
        log_event(db, user.id, "milestone_completed", "milestone", m.id, {"title": m.title})
    db.commit()
    return milestone_reads(db, user.id, [m])[0]


@router.delete("/{goal_id}/milestones/{ms_id}", status_code=204)
def delete_milestone(goal_id: uuid.UUID, ms_id: uuid.UUID, db: DB, user: CurrentUser):
    db.delete(_owned_milestone(db, user, goal_id, ms_id))
    db.commit()
    return Response(status_code=204)
