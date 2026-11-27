"""Personal projects: Kanban (idea -> planned -> in_progress -> done), progress from linked tasks,
detail view with the project's tasks, notes and calendar events."""
import uuid

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import func, select

from app.core.deps import DB, CurrentUser, ensure_refs_owned, get_owned
from app.core.time import utcnow
from app.models import CalendarEvent, Goal, Note, Project, Task
from app.schemas.more import ProjectCreate, ProjectRead, ProjectUpdate
from app.services import gamification as gm

router = APIRouter(prefix="/projects", tags=["projects"])


def project_reads(db, user, projects: list[Project]) -> list[ProjectRead]:
    ids = [p.id for p in projects]
    counts, notes = {}, {}
    if ids:
        for pid, total, done in db.execute(
                select(Task.project_id, func.count(), func.count().filter(Task.status == "done"))
                .where(Task.user_id == user.id, Task.project_id.in_(ids), Task.deleted_at.is_(None),
                       Task.status != "cancelled", Task.is_template.is_(False))
                .group_by(Task.project_id)):
            counts[pid] = (total, done)
        notes = dict(db.execute(select(Note.project_id, func.count()).where(
            Note.user_id == user.id, Note.project_id.in_(ids), Note.deleted_at.is_(None)).group_by(Note.project_id)).all())
    out = []
    for p in projects:
        r = ProjectRead.model_validate(p)
        r.tasks_total, r.tasks_done = counts.get(p.id, (0, 0))
        r.progress = 100.0 if p.status == "done" else (round(r.tasks_done / r.tasks_total * 100, 1)
                                                         if r.tasks_total else 0.0)
        r.notes_count = notes.get(p.id, 0)
        out.append(r)
    return out


def _on_status(db, user, p: Project, old: str | None):
    if p.status == "done" and old != "done":
        p.completed_at = utcnow()
        gm.award(db, user, "project_completed", "project", p.id)
    elif old == "done" and p.status != "done":
        p.completed_at = None
        gm.revoke(db, user, "project_completed", "project", p.id)


@router.get("", response_model=list[ProjectRead])
def list_projects(db: DB, user: CurrentUser, include_archived: bool = False, status: str | None = None,
                  goal_id: uuid.UUID | None = None, q: str | None = Query(None, max_length=200)):
    stmt = select(Project).where(Project.user_id == user.id, Project.deleted_at.is_(None))
    if not include_archived:
        stmt = stmt.where(Project.archived.is_(False))
    if status:
        stmt = stmt.where(Project.status == status)
    if goal_id:
        stmt = stmt.where(Project.goal_id == goal_id)
    if q:
        stmt = stmt.where(Project.title.ilike(f"%{q}%"))
    stmt = stmt.order_by(Project.position, Project.priority, Project.created_at.desc())
    return project_reads(db, user, list(db.scalars(stmt)))


@router.post("", response_model=ProjectRead, status_code=201)
def create_project(payload: ProjectCreate, db: DB, user: CurrentUser):
    ensure_refs_owned(db, user, {Goal: payload.goal_id})
    p = Project(user_id=user.id, **payload.model_dump())
    db.add(p)
    db.flush()
    _on_status(db, user, p, None)
    db.commit()
    return project_reads(db, user, [p])[0]


@router.get("/{project_id}")
def get_project(project_id: uuid.UUID, db: DB, user: CurrentUser):
    from app.api.v1.tasks import _reads

    p = get_owned(db, Project, project_id, user)
    tasks = db.scalars(select(Task).where(Task.user_id == user.id, Task.project_id == p.id,
                                          Task.deleted_at.is_(None), Task.is_template.is_(False))
                       .order_by(Task.status == "done", Task.priority, Task.due_at.asc().nulls_last())).all()
    notes = db.scalars(select(Note).where(Note.user_id == user.id, Note.project_id == p.id,
                                          Note.deleted_at.is_(None)).order_by(Note.updated_at.desc())).all()
    events = db.scalars(select(CalendarEvent).where(
        CalendarEvent.user_id == user.id, CalendarEvent.project_id == p.id, CalendarEvent.deleted_at.is_(None))
        .order_by(CalendarEvent.starts_at)).all()
    goal = db.get(Goal, p.goal_id) if p.goal_id else None
    return {
        **project_reads(db, user, [p])[0].model_dump(mode="json"),
        "goal": {"id": str(goal.id), "title": goal.title} if goal and goal.user_id == user.id else None,
        "tasks": [t.model_dump(mode="json") for t in _reads(db, user, list(tasks))],
        "notes": [{"id": str(n.id), "title": n.title, "updated_at": n.updated_at.isoformat()} for n in notes],
        "events": [{"id": str(e.id), "title": e.title, "starts_at": e.starts_at.isoformat(), "color": e.color}
                   for e in events],
    }


@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(project_id: uuid.UUID, payload: ProjectUpdate, db: DB, user: CurrentUser):
    p = get_owned(db, Project, project_id, user)
    data = payload.model_dump(exclude_unset=True)
    ensure_refs_owned(db, user, {Goal: data.get("goal_id")})
    old = p.status
    for k, v in data.items():
        setattr(p, k, v)
    if "status" in data:
        _on_status(db, user, p, old)
    db.commit()
    return project_reads(db, user, [p])[0]


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: uuid.UUID, db: DB, user: CurrentUser):
    """Soft delete. Tasks and notes stay and are simply unlinked."""
    p = get_owned(db, Project, project_id, user)
    if p.deleted_at:
        raise HTTPException(404, "Не найдено")
    p.deleted_at = utcnow()
    for model in (Task, Note, CalendarEvent):
        for row in db.scalars(select(model).where(model.user_id == user.id, model.project_id == p.id)):
            row.project_id = None
    db.commit()
    return Response(status_code=204)
