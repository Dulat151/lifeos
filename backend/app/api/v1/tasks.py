import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import func, or_, select

from app.core.deps import DB, CurrentUser, ensure_refs_owned, get_owned
from app.core.time import user_tz, utcnow
from app.models import Goal, Milestone, Task, TaskChecklistItem, TaskComment, TaskDependency, TaskHistory, TaskTag
from app.schemas import (BulkTaskIn, ChecklistItemIn, ChecklistItemRead, CommentIn, DependencyIn, MoveTaskIn,
                         TaskCreate, TaskRead, TaskUpdate)
from app.services import gamification as gm
from app.services.activity import log_event
from app.services.recurrence import next_after

router = APIRouter(prefix="/tasks", tags=["tasks"])
TRACKED = ("title", "status", "priority", "due_at", "goal_id", "milestone_id", "estimated_minutes", "description",
           "category", "archived")


def _reads(db, user, tasks: list[Task]) -> list[TaskRead]:
    ids = [t.id for t in tasks]
    deps: dict = {}
    blocked: set = set()
    sub: dict = {}
    if ids:
        rows = db.execute(select(TaskDependency.task_id, TaskDependency.depends_on_id, Task.status)
                          .join(Task, Task.id == TaskDependency.depends_on_id)
                          .where(TaskDependency.task_id.in_(ids))).all()
        for tid, dep, st in rows:
            deps.setdefault(tid, []).append(dep)
            if st not in ("done", "cancelled"):
                blocked.add(tid)
        for pid, total, done in db.execute(
                select(Task.parent_id, func.count(), func.count().filter(Task.status == "done"))
                .where(Task.parent_id.in_(ids), Task.deleted_at.is_(None)).group_by(Task.parent_id)):
            sub[pid] = (total, done)
    out = []
    for t in tasks:
        r = TaskRead.model_validate(t)
        r.depends_on = deps.get(t.id, [])
        r.blocked = t.id in blocked
        r.subtasks_total, r.subtasks_done = sub.get(t.id, (0, 0))
        out.append(r)
    return out


def _refs(db, user, data):
    ensure_refs_owned(db, user, {Task: data.get("parent_id"), Goal: data.get("goal_id"),
                                 Milestone: data.get("milestone_id")})
    if data.get("milestone_id") and not data.get("goal_id"):
        data["goal_id"] = db.get(Milestone, data["milestone_id"]).goal_id


def _on_status_change(db, user, t: Task, old: str):
    if t.status == "done" and old != "done":
        t.completed_at = utcnow()
        # key includes completion count so reopen+complete cannot farm XP but recurring copies are separate tasks
        gm.award(db, user, "task_done", "task", t.id)
        log_event(db, user.id, "task_done", "task", t.id, {"title": t.title})
        if t.recurrence_rule and not t.parent_id:
            _spawn_next(db, user, t)
    elif old == "done" and t.status != "done":
        t.completed_at = None
        gm.revoke(db, user, "task_done", "task", t.id)


def _spawn_next(db, user, t: Task):
    base = t.due_at or utcnow()
    nxt = next_after(t.recurrence_rule, base, user.profile.timezone, base)
    if not nxt:
        return
    copy = Task(user_id=user.id, title=t.title, description=t.description, priority=t.priority,
                category=t.category, due_at=nxt, estimated_minutes=t.estimated_minutes,
                recurrence_rule=t.recurrence_rule, goal_id=t.goal_id, milestone_id=t.milestone_id, status="todo")
    db.add(copy)
    db.flush()
    for tag in t.tags:
        db.add(TaskTag(task_id=copy.id, name=tag.name))
    for i, c in enumerate(t.checklist):
        db.add(TaskChecklistItem(user_id=user.id, task_id=copy.id, text=c.text, position=i))


@router.get("", response_model=dict)
def list_tasks(
    db: DB, user: CurrentUser,
    view: str = Query("all", pattern="^(all|today|upcoming|overdue|completed|backlog|templates|archived)$"),
    status: str | None = None, priority: int | None = None, tag: str | None = None, category: str | None = None,
    goal_id: uuid.UUID | None = None, parent_id: uuid.UUID | None = None, q: str | None = Query(None, max_length=200),
    sort: str = Query("smart", pattern="^(smart|due|priority|created|title|position)$"),
    limit: int = Query(200, ge=1, le=1000), offset: int = Query(0, ge=0),
):
    stmt = select(Task).where(Task.user_id == user.id, Task.deleted_at.is_(None))
    tz = user_tz(user)
    now_local = datetime.now(tz)
    start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    open_ = Task.status.notin_(("done", "cancelled"))
    stmt = stmt.where(Task.is_template.is_(view == "templates"))
    stmt = stmt.where(Task.archived.is_(view == "archived"))
    if parent_id:
        stmt = stmt.where(Task.parent_id == parent_id)
    elif view != "all" or not q:
        stmt = stmt.where(Task.parent_id.is_(None))
    if view == "today":
        stmt = stmt.where(open_, Task.due_at < end)
    elif view == "upcoming":
        stmt = stmt.where(open_, Task.due_at >= end)
    elif view == "overdue":
        stmt = stmt.where(open_, Task.due_at < utcnow())
    elif view == "completed":
        stmt = stmt.where(Task.status == "done")
    elif view == "backlog":
        stmt = stmt.where(Task.status == "backlog")
    if status:
        stmt = stmt.where(Task.status.in_(status.split(",")))
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if category:
        stmt = stmt.where(Task.category == category)
    if goal_id:
        stmt = stmt.where(Task.goal_id == goal_id)
    if tag:
        stmt = stmt.where(Task.id.in_(select(TaskTag.task_id).where(TaskTag.name == tag)))
    if q:
        stmt = stmt.where(or_(Task.title.ilike(f"%{q}%"), Task.description.ilike(f"%{q}%")))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    order = {
        "smart": (Task.status == "done", Task.due_at.asc().nulls_last(), Task.priority),
        "due": (Task.due_at.asc().nulls_last(),),
        "priority": (Task.priority, Task.due_at.asc().nulls_last()),
        "created": (Task.created_at.desc(),),
        "title": (Task.title,),
        "position": (Task.position, Task.created_at),
    }[sort]
    tasks = db.scalars(stmt.order_by(*order).limit(limit).offset(offset)).unique().all()
    return {"items": _reads(db, user, list(tasks)), "total": total}


@router.post("", response_model=TaskRead, status_code=201)
def create_task(payload: TaskCreate, db: DB, user: CurrentUser):
    data = payload.model_dump()
    tags, checklist = data.pop("tags"), data.pop("checklist")
    _refs(db, user, data)
    t = Task(**data, user_id=user.id)
    db.add(t)
    db.flush()
    for name in dict.fromkeys(tags):
        db.add(TaskTag(task_id=t.id, name=name))
    for i, c in enumerate(checklist):
        db.add(TaskChecklistItem(user_id=user.id, task_id=t.id, text=c["text"], done=c["done"], position=i))
    log_event(db, user.id, "task_created", "task", t.id)
    if t.status == "done":
        _on_status_change(db, user, t, "todo")
    db.commit()
    db.refresh(t)
    return _reads(db, user, [t])[0]


@router.post("/quick", response_model=TaskRead, status_code=201)
def quick_add(payload: dict, db: DB, user: CurrentUser):
    """Quick add: 'Купить молоко #дом !1 завтра' -> tags, priority, due date (сегодня/завтра/today/tomorrow)."""
    text = str(payload.get("text", "")).strip()
    if not text or len(text) > 300:
        raise HTTPException(422, "Текст задачи 1..300 символов")
    words, tags, prio, due = [], [], 2, None
    tz = user_tz(user)
    base = datetime.now(tz).replace(hour=23, minute=59, second=0, microsecond=0)
    for w in text.split():
        lw = w.lower()
        if w.startswith("#") and len(w) > 1:
            tags.append(w[1:][:60])
        elif len(w) == 2 and w[0] == "!" and w[1] in "1234":
            prio = int(w[1])
        elif lw in ("сегодня", "today", "бүгін"):
            due = base
        elif lw in ("завтра", "tomorrow", "ертең"):
            due = base + timedelta(days=1)
        else:
            words.append(w)
    title = " ".join(words) or text
    return create_task(TaskCreate(title=title, tags=tags, priority=prio, due_at=due), db, user)


@router.post("/bulk")
def bulk(payload: BulkTaskIn, db: DB, user: CurrentUser):
    tasks = db.scalars(select(Task).where(Task.id.in_(payload.ids), Task.user_id == user.id,
                                          Task.deleted_at.is_(None))).all()
    if len(tasks) != len(set(payload.ids)):
        raise HTTPException(404, "Некоторые задачи не найдены")
    if payload.goal_id:
        ensure_refs_owned(db, user, {Goal: payload.goal_id})
    now = utcnow()
    for t in tasks:
        if payload.action == "status" and payload.status:
            old = t.status
            t.status = payload.status
            _history(db, user, t, "status", old, t.status, now)
            _on_status_change(db, user, t, old)
        elif payload.action == "priority" and payload.priority:
            t.priority = payload.priority
        elif payload.action == "archive":
            t.archived = True
        elif payload.action == "delete":
            t.deleted_at = now
        elif payload.action == "move":
            t.goal_id = payload.goal_id
    db.commit()
    return {"updated": len(tasks)}


def _history(db, user, t, field, old, new, now):
    if old != new:
        db.add(TaskHistory(user_id=user.id, task_id=t.id, field=field, old_value=None if old is None else str(old),
                           new_value=None if new is None else str(new), changed_at=now))


@router.get("/tags")
def list_tags(db: DB, user: CurrentUser):
    rows = db.execute(select(TaskTag.name, func.count()).join(Task, Task.id == TaskTag.task_id)
                      .where(Task.user_id == user.id, Task.deleted_at.is_(None)).group_by(TaskTag.name)
                      .order_by(func.count().desc())).all()
    return [{"name": n, "count": c} for n, c in rows]


@router.get("/{task_id}", response_model=TaskRead)
def get_task(task_id: uuid.UUID, db: DB, user: CurrentUser):
    return _reads(db, user, [get_owned(db, Task, task_id, user)])[0]


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(task_id: uuid.UUID, payload: TaskUpdate, db: DB, user: CurrentUser):
    t = get_owned(db, Task, task_id, user)
    data = payload.model_dump(exclude_unset=True)
    tags, checklist = data.pop("tags", None), data.pop("checklist", None)
    _refs(db, user, {**data, "parent_id": data.get("parent_id")})
    if data.get("parent_id") == t.id:
        raise HTTPException(422, "Задача не может быть подзадачей самой себя")
    if data.get("status") == "done" and data.get("status") != t.status:
        _assert_unblocked(db, t)
    old_status = t.status
    now = utcnow()
    for k, v in data.items():
        if k in TRACKED:
            _history(db, user, t, k, getattr(t, k), v, now)
        setattr(t, k, v)
    if tags is not None:
        t.tags.clear()
        db.flush()
        for name in dict.fromkeys(tags):
            t.tags.append(TaskTag(task_id=t.id, name=name))
    if checklist is not None:
        t.checklist.clear()
        db.flush()
        for i, c in enumerate(checklist):
            t.checklist.append(TaskChecklistItem(user_id=user.id, task_id=t.id, text=c["text"], done=c["done"],
                                                 position=i))
    if "status" in data:
        _on_status_change(db, user, t, old_status)
    db.commit()
    db.refresh(t)
    return _reads(db, user, [t])[0]


def _assert_unblocked(db, t: Task):
    open_deps = db.scalar(select(func.count()).select_from(TaskDependency).join(
        Task, Task.id == TaskDependency.depends_on_id).where(
        TaskDependency.task_id == t.id, Task.status.notin_(("done", "cancelled")), Task.deleted_at.is_(None)))
    if open_deps:
        raise HTTPException(409, "Задача заблокирована незавершёнными зависимостями")


@router.post("/{task_id}/move", response_model=TaskRead)
def move_task(task_id: uuid.UUID, payload: MoveTaskIn, db: DB, user: CurrentUser):
    """Kanban drag & drop: change column (status) and position."""
    return update_task(task_id, TaskUpdate(status=payload.status, position=payload.position), db, user)


@router.post("/{task_id}/duplicate", response_model=TaskRead, status_code=201)
def duplicate(task_id: uuid.UUID, db: DB, user: CurrentUser):
    """Also used to instantiate a task from a template."""
    t = get_owned(db, Task, task_id, user)
    return create_task(TaskCreate(
        title=t.title, description=t.description, priority=t.priority, category=t.category,
        estimated_minutes=t.estimated_minutes, goal_id=t.goal_id, milestone_id=t.milestone_id,
        tags=[x.name for x in t.tags], checklist=[ChecklistItemIn(text=c.text) for c in t.checklist],
    ), db, user)


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: uuid.UUID, db: DB, user: CurrentUser):
    t = get_owned(db, Task, task_id, user)
    t.deleted_at = utcnow()
    db.commit()
    return Response(status_code=204)


@router.post("/{task_id}/restore", response_model=TaskRead)
def restore_task(task_id: uuid.UUID, db: DB, user: CurrentUser):
    t = get_owned(db, Task, task_id, user, include_deleted=True)
    t.deleted_at = None
    t.archived = False
    db.commit()
    return _reads(db, user, [t])[0]


@router.patch("/{task_id}/checklist/{item_id}", response_model=ChecklistItemRead)
def toggle_check(task_id: uuid.UUID, item_id: uuid.UUID, payload: ChecklistItemIn, db: DB, user: CurrentUser):
    get_owned(db, Task, task_id, user)
    item = db.scalar(select(TaskChecklistItem).where(TaskChecklistItem.id == item_id,
                                                     TaskChecklistItem.task_id == task_id,
                                                     TaskChecklistItem.user_id == user.id))
    if not item:
        raise HTTPException(404, "Пункт не найден")
    item.text, item.done = payload.text, payload.done
    db.commit()
    return ChecklistItemRead.model_validate(item)


@router.get("/{task_id}/history")
def history(task_id: uuid.UUID, db: DB, user: CurrentUser):
    get_owned(db, Task, task_id, user)
    rows = db.scalars(select(TaskHistory).where(TaskHistory.task_id == task_id)
                      .order_by(TaskHistory.changed_at.desc()).limit(200))
    return [{"field": h.field, "old": h.old_value, "new": h.new_value, "at": h.changed_at.isoformat()} for h in rows]


@router.get("/{task_id}/comments")
def comments(task_id: uuid.UUID, db: DB, user: CurrentUser):
    get_owned(db, Task, task_id, user)
    rows = db.scalars(select(TaskComment).where(TaskComment.task_id == task_id).order_by(TaskComment.created_at))
    return [{"id": str(c.id), "body": c.body, "created_at": c.created_at.isoformat()} for c in rows]


@router.post("/{task_id}/comments", status_code=201)
def add_comment(task_id: uuid.UUID, payload: CommentIn, db: DB, user: CurrentUser):
    get_owned(db, Task, task_id, user)
    c = TaskComment(user_id=user.id, task_id=task_id, body=payload.body)
    db.add(c)
    db.commit()
    return {"id": str(c.id), "body": c.body, "created_at": c.created_at.isoformat()}


@router.delete("/{task_id}/comments/{comment_id}", status_code=204)
def delete_comment(task_id: uuid.UUID, comment_id: uuid.UUID, db: DB, user: CurrentUser):
    c = db.scalar(select(TaskComment).where(TaskComment.id == comment_id, TaskComment.task_id == task_id,
                                            TaskComment.user_id == user.id))
    if not c:
        raise HTTPException(404, "Комментарий не найден")
    db.delete(c)
    db.commit()
    return Response(status_code=204)


@router.post("/{task_id}/dependencies", status_code=201)
def add_dependency(task_id: uuid.UUID, payload: DependencyIn, db: DB, user: CurrentUser):
    get_owned(db, Task, task_id, user)
    get_owned(db, Task, payload.depends_on_id, user)
    if payload.depends_on_id == task_id:
        raise HTTPException(422, "Задача не может зависеть от себя")
    # cycle detection (DFS over existing edges)
    stack, seen = [payload.depends_on_id], set()
    while stack:
        cur = stack.pop()
        if cur == task_id:
            raise HTTPException(409, "Зависимость создаёт цикл")
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(db.scalars(select(TaskDependency.depends_on_id).where(TaskDependency.task_id == cur)))
    if not db.get(TaskDependency, (task_id, payload.depends_on_id)):
        db.add(TaskDependency(task_id=task_id, depends_on_id=payload.depends_on_id))
    db.commit()
    return {"ok": True}


@router.delete("/{task_id}/dependencies/{dep_id}", status_code=204)
def remove_dependency(task_id: uuid.UUID, dep_id: uuid.UUID, db: DB, user: CurrentUser):
    get_owned(db, Task, task_id, user)
    d = db.get(TaskDependency, (task_id, dep_id))
    if d:
        db.delete(d)
        db.commit()
    return Response(status_code=204)
