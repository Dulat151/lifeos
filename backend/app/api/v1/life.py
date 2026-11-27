"""Health & fitness, finance, journal, notes & knowledge graph, focus."""
import re
import uuid
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy import delete, func, or_, select

from app.api.crud import crud_router
from app.core.deps import DB, CurrentUser, ensure_refs_owned, get_owned
from app.core.time import local_today, user_tz, utcnow
from app.models import (Book, Budget, Habit, Project, Course, Distraction, Exercise, FocusSession, Folder, Goal, HealthLog,
                        JournalEntry, JournalTemplate, LearningSession, Note, NoteLink, SavingsGoal, Subject,
                        Subscription, Task, Transaction, Workout, WorkoutPlan, WorkoutSet)
from app.schemas.more import (BudgetCreate, BudgetRead, BudgetUpdate, DistractionIn, DistractionRead, ExerciseCreate,
                              ExerciseRead, ExerciseUpdate, FocusRead, FocusStartIn, FolderCreate, FolderRead,
                              FolderUpdate, HealthLogCreate, HealthLogRead, HealthLogUpdate, JournalCreate,
                              JournalRead, JournalTemplateCreate, JournalTemplateRead, JournalTemplateUpdate,
                              JournalUpdate, NoteCreate, NoteRead, NoteUpdate, SavingsGoalCreate, SavingsGoalRead,
                              SavingsGoalUpdate, SetRead, SubscriptionCreate, SubscriptionRead, SubscriptionUpdate,
                              TransactionCreate, TransactionRead, TransactionUpdate, WorkoutCreate, WorkoutPlanCreate,
                              WorkoutPlanRead, WorkoutPlanUpdate, WorkoutRead, WorkoutUpdate)
from app.services import gamification as gm
from app.services.activity import log_event

# ================================================================ Health / fitness
health = APIRouter(prefix="/health", tags=["health"])


def _workout_read(db, w) -> WorkoutRead:
    r = WorkoutRead.model_validate(w)
    r.sets = [SetRead.model_validate(s) for s in db.scalars(
        select(WorkoutSet).where(WorkoutSet.workout_id == w.id).order_by(WorkoutSet.set_number))]
    return r


def _save_sets(db, user, w, sets):
    for s in sets:
        get_owned(db, Exercise, s.exercise_id, user)
    db.execute(delete(WorkoutSet).where(WorkoutSet.workout_id == w.id))
    for s in sets:
        db.add(WorkoutSet(user_id=user.id, workout_id=w.id, **s.model_dump()))


@health.get("/workouts", response_model=list[WorkoutRead])
def list_workouts(db: DB, user: CurrentUser, start: date | None = None, end: date | None = None):
    stmt = select(Workout).where(Workout.user_id == user.id)
    if start:
        stmt = stmt.where(Workout.performed_on >= start)
    if end:
        stmt = stmt.where(Workout.performed_on <= end)
    return [_workout_read(db, w) for w in db.scalars(stmt.order_by(Workout.performed_on.desc()).limit(500))]


@health.post("/workouts", response_model=WorkoutRead, status_code=201)
def create_workout(payload: WorkoutCreate, db: DB, user: CurrentUser):
    ensure_refs_owned(db, user, {WorkoutPlan: payload.plan_id})
    data = payload.model_dump(exclude={"sets"})
    w = Workout(**data, user_id=user.id)
    db.add(w)
    db.flush()
    _save_sets(db, user, w, payload.sets)
    if not w.is_rest_day:
        gm.award(db, user, "workout", "workout", w.id)
        log_event(db, user.id, "workout", "workout", w.id, {"minutes": w.duration_minutes})
    db.commit()
    return _workout_read(db, w)


@health.patch("/workouts/{wid}", response_model=WorkoutRead)
def update_workout(wid: uuid.UUID, payload: WorkoutUpdate, db: DB, user: CurrentUser):
    w = get_owned(db, Workout, wid, user)
    data = payload.model_dump(exclude_unset=True, exclude={"sets"})
    for k, v in data.items():
        if v is None:
            raise HTTPException(422, f"Поле {k} не может быть пустым")
        setattr(w, k, v)
    if payload.sets is not None:
        _save_sets(db, user, w, payload.sets)
    db.commit()
    return _workout_read(db, w)


@health.delete("/workouts/{wid}", status_code=204)
def delete_workout(wid: uuid.UUID, db: DB, user: CurrentUser):
    db.delete(get_owned(db, Workout, wid, user))
    db.commit()
    return Response(status_code=204)


@health.get("/summary")
def health_summary(db: DB, user: CurrentUser, days: int = Query(30, ge=7, le=365)):
    today = local_today(user)
    since = today - timedelta(days=days - 1)
    logs = db.scalars(select(HealthLog).where(HealthLog.user_id == user.id, HealthLog.log_date >= since)).all()
    series: dict = defaultdict(dict)
    for lg in logs:
        # water/walking are summed per day; others averaged
        bucket = series[lg.kind].setdefault(lg.log_date.isoformat(), [])
        bucket.append(lg.value)
    agg = {}
    for kind, days_map in series.items():
        pts = []
        for d, vals in sorted(days_map.items()):
            v = sum(vals) if kind in ("water", "walking") else sum(vals) / len(vals)
            pts.append({"date": d, "value": round(v, 2)})
        agg[kind] = {"points": pts, "average": round(sum(p["value"] for p in pts) / len(pts), 2) if pts else None}
    workouts = db.scalars(select(Workout).where(Workout.user_id == user.id, Workout.performed_on >= since)).all()
    real = [w for w in workouts if not w.is_rest_day]
    return {"days": days, "metrics": agg, "workouts": len(real), "rest_days": len(workouts) - len(real),
            "workout_minutes": sum(w.duration_minutes for w in real),
            "workout_days": sorted({w.performed_on.isoformat() for w in real})}


@health.get("/exercises/{eid}/progress")
def exercise_progress(eid: uuid.UUID, db: DB, user: CurrentUser):
    get_owned(db, Exercise, eid, user)
    rows = db.execute(select(Workout.performed_on, func.max(WorkoutSet.weight_kg), func.sum(WorkoutSet.reps),
                             func.sum(WorkoutSet.duration_seconds))
                      .join(Workout, Workout.id == WorkoutSet.workout_id)
                      .where(WorkoutSet.exercise_id == eid, WorkoutSet.user_id == user.id)
                      .group_by(Workout.performed_on).order_by(Workout.performed_on)).all()
    return [{"date": d.isoformat(), "max_weight": w, "total_reps": r, "total_seconds": s} for d, w, r, s in rows]


crud_router(model=Exercise, create_schema=ExerciseCreate, update_schema=ExerciseUpdate, read_schema=ExerciseRead,
            tags=["health"], router=health, path="/exercises", search_fields=("name",), order_by=(Exercise.name,))
crud_router(model=WorkoutPlan, create_schema=WorkoutPlanCreate, update_schema=WorkoutPlanUpdate,
            read_schema=WorkoutPlanRead, tags=["health"], router=health, path="/plans")
crud_router(model=HealthLog, create_schema=HealthLogCreate, update_schema=HealthLogUpdate, read_schema=HealthLogRead,
            tags=["health"], router=health, path="/logs", filter_fields=("kind", "log_date"),
            order_by=(HealthLog.log_date.desc(), HealthLog.created_at.desc()))

# ================================================================ Finance
finance = APIRouter(prefix="/finance", tags=["finance"])


def _month_bounds(month: date):
    start = month.replace(day=1)
    end = (start + timedelta(days=32)).replace(day=1)
    return start, end


@finance.get("/transactions", response_model=dict)
def list_transactions(db: DB, user: CurrentUser, kind: str | None = None, category: str | None = None,
                      start: date | None = None, end: date | None = None, q: str | None = Query(None, max_length=200),
                      limit: int = Query(200, ge=1, le=1000), offset: int = Query(0, ge=0)):
    stmt = select(Transaction).where(Transaction.user_id == user.id, Transaction.deleted_at.is_(None))
    if kind:
        stmt = stmt.where(Transaction.kind == kind)
    if category:
        stmt = stmt.where(Transaction.category == category)
    if start:
        stmt = stmt.where(Transaction.occurred_on >= start)
    if end:
        stmt = stmt.where(Transaction.occurred_on <= end)
    if q:
        stmt = stmt.where(or_(Transaction.description.ilike(f"%{q}%"), Transaction.category.ilike(f"%{q}%")))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = db.scalars(stmt.order_by(Transaction.occurred_on.desc(), Transaction.created_at.desc())
                       .limit(limit).offset(offset)).all()
    return {"items": [TransactionRead.model_validate(t) for t in items], "total": total}


def _apply_savings(db, user, t: Transaction, sign: int):
    if t.savings_goal_id and t.kind == "expense":
        sg = db.get(SavingsGoal, t.savings_goal_id)
        if sg and sg.user_id == user.id:
            sg.saved_amount = max(Decimal(0), sg.saved_amount + sign * t.amount)


def _after_tx_create(db, user, t):
    _apply_savings(db, user, t, +1)
    log_event(db, user.id, "transaction", "transaction", t.id, {"kind": t.kind, "amount": str(t.amount)})


def _after_tx_update(db, user, t, before):
    if "amount" in before or "savings_goal_id" in before or "kind" in before:
        old = Transaction(kind=before.get("kind", t.kind), amount=before.get("amount", t.amount),
                          savings_goal_id=before.get("savings_goal_id", t.savings_goal_id))
        _apply_savings(db, user, old, -1)
        _apply_savings(db, user, t, +1)


def _before_tx_delete(db, user, t):
    _apply_savings(db, user, t, -1)


crud_router(model=Transaction, create_schema=TransactionCreate, update_schema=TransactionUpdate,
            read_schema=TransactionRead, tags=["finance"], router=finance, path="/transactions", skip=("list",),
            ref_models={"savings_goal_id": SavingsGoal}, after_create=_after_tx_create,
            after_update=_after_tx_update, before_delete=_before_tx_delete)


@finance.get("/report")
def finance_report(db: DB, user: CurrentUser, month: date | None = None):
    """Monthly report in the user's main currency. Transactions in other currencies are reported separately
    (no exchange-rate service is configured, so they are not converted)."""
    cur = user.settings.currency
    month = month or local_today(user)
    start, end = _month_bounds(month)
    txs = db.scalars(select(Transaction).where(Transaction.user_id == user.id, Transaction.deleted_at.is_(None),
                                               Transaction.occurred_on >= start, Transaction.occurred_on < end)).all()
    main = [t for t in txs if t.currency == cur]
    other = defaultdict(lambda: {"income": Decimal(0), "expense": Decimal(0)})
    for t in txs:
        if t.currency != cur:
            other[t.currency][t.kind] += t.amount
    income = sum((t.amount for t in main if t.kind == "income"), Decimal(0))
    expense = sum((t.amount for t in main if t.kind == "expense"), Decimal(0))
    by_cat = defaultdict(Decimal)
    daily = defaultdict(lambda: {"income": Decimal(0), "expense": Decimal(0)})
    for t in main:
        if t.kind == "expense":
            by_cat[t.category] += t.amount
        daily[t.occurred_on.isoformat()][t.kind] += t.amount
    budgets = db.scalars(select(Budget).where(Budget.user_id == user.id, Budget.month == start)).all()
    trend = []
    ms = start
    months = []
    for _ in range(6):
        months.append(ms)
        ms = (ms - timedelta(days=1)).replace(day=1)
    for ms in reversed(months):
        s2, e2 = _month_bounds(ms)
        rows = db.execute(select(Transaction.kind, func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == user.id, Transaction.deleted_at.is_(None), Transaction.currency == cur,
            Transaction.occurred_on >= s2, Transaction.occurred_on < e2).group_by(Transaction.kind)).all()
        d = dict(rows)
        trend.append({"month": s2.isoformat()[:7], "income": str(d.get("income", 0)),
                      "expense": str(d.get("expense", 0))})
    return {
        "month": start.isoformat()[:7], "currency": cur, "income": str(income), "expense": str(expense),
        "balance": str(income - expense),
        "savings_rate": round(float((income - expense) / income * 100), 1) if income else None,
        "by_category": [{"category": k, "amount": str(v)} for k, v in sorted(by_cat.items(), key=lambda x: -x[1])],
        "daily": [{"date": k, "income": str(v["income"]), "expense": str(v["expense"])}
                  for k, v in sorted(daily.items())],
        "budgets": [{"id": str(b.id), "category": b.category, "limit": str(b.limit_amount),
                     "spent": str(by_cat.get(b.category, Decimal(0))),
                     "percent": round(float(by_cat.get(b.category, 0) / b.limit_amount * 100), 1)
                     if b.limit_amount else None} for b in budgets if b.currency == cur],
        "other_currencies": {k: {kk: str(vv) for kk, vv in v.items()} for k, v in other.items()},
        "trend": trend,
    }


@finance.get("/categories")
def finance_categories(db: DB, user: CurrentUser):
    rows = db.execute(select(Transaction.kind, Transaction.category, func.count()).where(
        Transaction.user_id == user.id, Transaction.deleted_at.is_(None))
        .group_by(Transaction.kind, Transaction.category)).all()
    return [{"kind": k, "category": c, "count": n} for k, c, n in rows]


@finance.get("/budgets", response_model=list[BudgetRead])
def list_budgets(db: DB, user: CurrentUser, month: date | None = None):
    start, end = _month_bounds(month or local_today(user))
    budgets = db.scalars(select(Budget).where(Budget.user_id == user.id, Budget.month == start)).all()
    out = []
    for b in budgets:
        r = BudgetRead.model_validate(b)
        r.spent = db.scalar(select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == user.id, Transaction.deleted_at.is_(None), Transaction.kind == "expense",
            Transaction.category == b.category, Transaction.currency == b.currency,
            Transaction.occurred_on >= start, Transaction.occurred_on < end)) or Decimal(0)
        out.append(r)
    return out


crud_router(model=Budget, create_schema=BudgetCreate, update_schema=BudgetUpdate, read_schema=BudgetRead,
            tags=["finance"], router=finance, path="/budgets", skip=("list",))
crud_router(model=SavingsGoal, create_schema=SavingsGoalCreate, update_schema=SavingsGoalUpdate,
            read_schema=SavingsGoalRead, tags=["finance"], router=finance, path="/savings-goals")
crud_router(model=Subscription, create_schema=SubscriptionCreate, update_schema=SubscriptionUpdate,
            read_schema=SubscriptionRead, tags=["finance"], router=finance, path="/subscriptions",
            order_by=(Subscription.next_payment_on,), filter_fields=("is_active",))


@finance.post("/subscriptions/process")
def process_subs(db: DB, user: CurrentUser):
    """Run the recurring-payment job now for this user (the scheduler also runs it hourly)."""
    from app.services.finance import STEP

    today = local_today(user)
    n = 0
    for s in db.scalars(select(Subscription).where(Subscription.user_id == user.id, Subscription.is_active.is_(True),
                                                   Subscription.next_payment_on <= today)):
        while s.next_payment_on <= today:
            if not db.scalar(select(Transaction.id).where(Transaction.subscription_id == s.id,
                                                          Transaction.occurred_on == s.next_payment_on)):
                db.add(Transaction(user_id=user.id, kind="expense", amount=s.amount, currency=s.currency,
                                   category=s.category, description=s.title, occurred_on=s.next_payment_on,
                                   subscription_id=s.id))
                n += 1
            s.next_payment_on += STEP[s.period]
    db.commit()
    return {"created": n}


# ================================================================ Journal
journal = APIRouter(prefix="/journal", tags=["journal"])

DEFAULT_TEMPLATES = [
    ("Утренняя рефлексия", "morning", ["За что я благодарен сегодня?", "Главная цель дня?", "Как я себя чувствую?"]),
    ("Вечерняя рефлексия", "evening", ["Что получилось сегодня?", "Что можно улучшить?", "Чему я научился?"]),
    ("Недельный обзор", "weekly_review", ["Главные победы недели", "Что не получилось и почему", "Фокус на неделю"]),
    ("Месячный обзор", "monthly_review", ["Итоги месяца по целям", "Привычки: что закрепилось", "Планы на месяц"]),
]


@journal.get("/templates", response_model=list[JournalTemplateRead])
def templates(db: DB, user: CurrentUser):
    rows = db.scalars(select(JournalTemplate).where(JournalTemplate.user_id == user.id)).all()
    if not rows:
        for t, k, p in DEFAULT_TEMPLATES:
            db.add(JournalTemplate(user_id=user.id, title=t, kind=k, prompts=p))
        db.commit()
        rows = db.scalars(select(JournalTemplate).where(JournalTemplate.user_id == user.id)).all()
    return rows


@journal.get("/calendar")
def journal_calendar(db: DB, user: CurrentUser, year: int, month: int = Query(..., ge=1, le=12)):
    start = date(year, month, 1)
    end = (start + timedelta(days=32)).replace(day=1)
    rows = db.execute(select(JournalEntry.entry_date, func.count(), func.avg(JournalEntry.mood)).where(
        JournalEntry.user_id == user.id, JournalEntry.deleted_at.is_(None), JournalEntry.entry_date >= start,
        JournalEntry.entry_date < end).group_by(JournalEntry.entry_date)).all()
    return [{"date": d.isoformat(), "count": c, "mood": round(float(m), 1) if m else None} for d, c, m in rows]


@journal.get("/export.md", response_class=PlainTextResponse)
def journal_export(db: DB, user: CurrentUser):
    rows = db.scalars(select(JournalEntry).where(JournalEntry.user_id == user.id, JournalEntry.deleted_at.is_(None))
                      .order_by(JournalEntry.entry_date)).all()
    parts = [f"# {e.entry_date.isoformat()} — {e.title or e.kind}\n\n{e.body}\n" for e in rows]
    return PlainTextResponse("\n".join(parts) or "", headers={
        "Content-Disposition": 'attachment; filename="journal.md"'})


def _journal_xp(db, user, e):
    gm.award(db, user, "journal_entry", "journal", e.id, key=f"journal_entry:{e.entry_date.isoformat()}:{e.kind}")


crud_router(model=JournalEntry, create_schema=JournalCreate, update_schema=JournalUpdate, read_schema=JournalRead,
            tags=["journal"], router=journal, path="/entries", search_fields=("title", "body"),
            filter_fields=("kind", "entry_date"), ref_models={"template_id": JournalTemplate},
            order_by=(JournalEntry.entry_date.desc(), JournalEntry.created_at.desc()), after_create=_journal_xp)
crud_router(model=JournalTemplate, create_schema=JournalTemplateCreate, update_schema=JournalTemplateUpdate,
            read_schema=JournalTemplateRead, tags=["journal"], router=journal, path="/templates", skip=("list",))

# ================================================================ Notes & knowledge graph
notes = APIRouter(prefix="/notes", tags=["notes"])
LINK_RE = re.compile(r"\[\[([^\]\n]{1,300})\]\]")


def sync_links(db, user, note: Note):
    """[[Title]] in Markdown creates a link to the user's note with that title."""
    titles = {m.strip() for m in LINK_RE.findall(note.content or "")}
    db.execute(delete(NoteLink).where(NoteLink.source_id == note.id))
    if titles:
        targets = db.scalars(select(Note.id).where(Note.user_id == user.id, Note.deleted_at.is_(None),
                                                   func.lower(Note.title).in_([t.lower() for t in titles]),
                                                   Note.id != note.id)).all()
        for tid in set(targets):
            db.add(NoteLink(source_id=note.id, target_id=tid))


NOTE_REFS = {"folder_id": Folder, "goal_id": Goal, "course_id": Course, "book_id": Book, "task_id": Task,
             "project_id": Project, "habit_id": Habit}


@notes.get("/graph")
def knowledge_graph(db: DB, user: CurrentUser):
    """Nodes: notes + linked goals/courses/books/tasks. Edges: note links and note->entity relations."""
    ns = db.scalars(select(Note).where(Note.user_id == user.id, Note.deleted_at.is_(None))).all()
    ids = {n.id for n in ns}
    nodes = [{"id": str(n.id), "label": n.title, "type": "note"} for n in ns]
    edges = [{"source": str(s), "target": str(t), "type": "link"} for s, t in db.execute(
        select(NoteLink.source_id, NoteLink.target_id).where(NoteLink.source_id.in_(ids)))] if ids else []
    for field, model, typ in (("goal_id", Goal, "goal"), ("course_id", Course, "course"), ("book_id", Book, "book"),
                              ("task_id", Task, "task")):
        ent_ids = {getattr(n, field) for n in ns if getattr(n, field)}
        if not ent_ids:
            continue
        for e in db.scalars(select(model).where(model.id.in_(ent_ids), model.user_id == user.id)):
            nodes.append({"id": str(e.id), "label": e.title, "type": typ})
        for n in ns:
            if getattr(n, field):
                edges.append({"source": str(n.id), "target": str(getattr(n, field)), "type": typ})
    return {"nodes": nodes, "edges": edges}


@notes.get("/{note_id}/backlinks")
def backlinks(note_id: uuid.UUID, db: DB, user: CurrentUser):
    get_owned(db, Note, note_id, user)
    rows = db.scalars(select(Note).join(NoteLink, NoteLink.source_id == Note.id).where(
        NoteLink.target_id == note_id, Note.deleted_at.is_(None), Note.user_id == user.id)).all()
    out_links = db.scalars(select(Note).join(NoteLink, NoteLink.target_id == Note.id).where(
        NoteLink.source_id == note_id, Note.deleted_at.is_(None))).all()
    return {"backlinks": [{"id": str(n.id), "title": n.title} for n in rows],
            "links": [{"id": str(n.id), "title": n.title} for n in out_links]}


@notes.post("/import")
async def import_notes(db: DB, user: CurrentUser, files: list[UploadFile] = File(...),
                       source: str = Form("auto")):
    """Google Keep (Takeout .zip/.json) and Apple Notes (.md/.html/.txt or .zip of them)."""
    from app.core.config import settings
    from app.services import notes_import as ni

    limit = settings.max_upload_mb * 1024 * 1024
    raw_files = []
    for f in files[:200]:
        raw = await f.read(limit + 1)
        if len(raw) > limit:
            raise HTTPException(413, f"Файл {f.filename} больше {settings.max_upload_mb} МБ")
        raw_files.append((f.filename or "note.txt", raw))
    try:
        parsed, unsupported = ni.collect(raw_files, source if source in ("auto", "keep", "apple") else "auto")
    except ni.NotesImportError as e:
        raise HTTPException(422, str(e)) from None
    if not parsed:
        raise HTTPException(422, "В файлах не найдено заметок. Поддерживаются .zip, .json (Google Keep), "
                                 ".md, .txt, .html")
    result = ni.save(db, user, parsed, after_save=lambda n: sync_links(db, user, n))
    db.commit()
    return {**result, "unsupported_files": unsupported}


crud_router(model=Note, create_schema=NoteCreate, update_schema=NoteUpdate, read_schema=NoteRead, tags=["notes"],
            router=notes, path="", search_fields=("title", "content"),
            filter_fields=("folder_id", "is_favorite", "is_pinned", "category", "goal_id", "course_id", "book_id", "task_id",
                           "project_id", "habit_id"),
            ref_models=NOTE_REFS, order_by=(Note.is_pinned.desc(), Note.updated_at.desc()),
            after_create=lambda db, u, n: sync_links(db, u, n),
            after_update=lambda db, u, n, b: sync_links(db, u, n) if "content" in b else None)
folders = crud_router(model=Folder, create_schema=FolderCreate, update_schema=FolderUpdate, read_schema=FolderRead,
                      tags=["notes"], router=APIRouter(prefix="/folders", tags=["notes"]), path="",
                      ref_models={"parent_id": Folder}, order_by=(Folder.name,))

# ================================================================ Focus
focus = APIRouter(prefix="/focus", tags=["focus"])


def _elapsed(s: FocusSession) -> int:
    extra = int((utcnow() - s.segment_started_at).total_seconds()) if s.status == "running" and \
        s.segment_started_at else 0
    return s.focused_seconds + extra


def _focus_read(s) -> FocusRead:
    r = FocusRead.model_validate(s)
    r.elapsed_seconds = _elapsed(s)
    return r


@focus.get("/active", response_model=FocusRead | None)
def active(db: DB, user: CurrentUser):
    s = db.scalar(select(FocusSession).where(FocusSession.user_id == user.id,
                                             FocusSession.status.in_(("running", "paused")))
                  .order_by(FocusSession.started_at.desc()))
    return _focus_read(s) if s else None


@focus.post("/start", response_model=FocusRead, status_code=201)
def start(payload: FocusStartIn, db: DB, user: CurrentUser):
    ensure_refs_owned(db, user, {Task: payload.task_id, Subject: payload.subject_id})
    if db.scalar(select(FocusSession.id).where(FocusSession.user_id == user.id,
                                               FocusSession.status.in_(("running", "paused")))):
        raise HTTPException(409, "Уже есть активная сессия")
    now = utcnow()
    s = FocusSession(user_id=user.id, **payload.model_dump(), status="running", started_at=now,
                     segment_started_at=now)
    db.add(s)
    db.commit()
    return _focus_read(s)


def _get_session(db, user, sid) -> FocusSession:
    return get_owned(db, FocusSession, sid, user)


@focus.post("/{sid}/pause", response_model=FocusRead)
def pause(sid: uuid.UUID, db: DB, user: CurrentUser):
    s = _get_session(db, user, sid)
    if s.status != "running":
        raise HTTPException(409, "Сессия не запущена")
    s.focused_seconds = _elapsed(s)
    s.status, s.segment_started_at = "paused", None
    db.commit()
    return _focus_read(s)


@focus.post("/{sid}/resume", response_model=FocusRead)
def resume(sid: uuid.UUID, db: DB, user: CurrentUser):
    s = _get_session(db, user, sid)
    if s.status != "paused":
        raise HTTPException(409, "Сессия не на паузе")
    s.status, s.segment_started_at = "running", utcnow()
    db.commit()
    return _focus_read(s)


@focus.post("/{sid}/heartbeat", response_model=FocusRead)
def heartbeat(sid: uuid.UUID, db: DB, user: CurrentUser):
    """Autosave: persists elapsed time so a crash/closed tab does not lose progress."""
    s = _get_session(db, user, sid)
    if s.status == "running":
        now = utcnow()
        s.focused_seconds = _elapsed(s)
        s.segment_started_at = now
        db.commit()
    return _focus_read(s)


@focus.post("/{sid}/finish", response_model=FocusRead)
def finish(sid: uuid.UUID, db: DB, user: CurrentUser):
    s = _get_session(db, user, sid)
    if s.status not in ("running", "paused"):
        raise HTTPException(409, "Сессия уже завершена")
    s.focused_seconds = _elapsed(s)
    s.status, s.ended_at, s.segment_started_at = "completed", utcnow(), None
    minutes = s.focused_seconds // 60
    if s.kind != "break" and minutes >= 1:
        gm.award(db, user, "focus_session", "focus", s.id)
        log_event(db, user.id, "focus_session", "focus", s.id, {"minutes": minutes})
        if s.task_id:
            t = db.get(Task, s.task_id)
            if t and t.user_id == user.id:
                t.actual_minutes += minutes
        if s.subject_id or s.kind == "study":
            ls = LearningSession(user_id=user.id, subject_id=s.subject_id, started_at=s.started_at,
                                 duration_minutes=max(1, minutes), source="focus", notes=s.note)
            db.add(ls)
            db.flush()
            gm.award(db, user, "learning_session", "learning_session", ls.id)
    db.commit()
    return _focus_read(s)


@focus.post("/{sid}/cancel", response_model=FocusRead)
def cancel(sid: uuid.UUID, db: DB, user: CurrentUser):
    s = _get_session(db, user, sid)
    if s.status not in ("running", "paused"):
        raise HTTPException(409, "Сессия уже завершена")
    s.focused_seconds = _elapsed(s)
    s.status, s.ended_at, s.segment_started_at = "cancelled", utcnow(), None
    db.commit()
    return _focus_read(s)


@focus.get("/history", response_model=list[FocusRead])
def history(db: DB, user: CurrentUser, limit: int = Query(100, ge=1, le=1000)):
    return [_focus_read(s) for s in db.scalars(select(FocusSession).where(FocusSession.user_id == user.id)
                                               .order_by(FocusSession.started_at.desc()).limit(limit))]


@focus.get("/stats")
def focus_stats(db: DB, user: CurrentUser):
    tz = user_tz(user)
    today = local_today(user)
    rows = db.scalars(select(FocusSession).where(FocusSession.user_id == user.id, FocusSession.status == "completed",
                                                 FocusSession.kind != "break")).all()

    def mins(since):
        return round(sum(s.focused_seconds for s in rows if s.started_at.astimezone(tz).date() >= since) / 60)

    daily = []
    for i in range(14):
        d = today - timedelta(days=13 - i)
        daily.append({"date": d.isoformat(), "minutes": round(sum(
            s.focused_seconds for s in rows if s.started_at.astimezone(tz).date() == d) / 60)})
    return {"today_minutes": mins(today), "week_minutes": mins(today - timedelta(days=today.weekday())),
            "month_minutes": mins(today.replace(day=1)), "total_hours": round(sum(s.focused_seconds for s in rows)
                                                                              / 3600, 1),
            "completed_sessions": len(rows), "daily": daily,
            "distractions_week": db.scalar(select(func.count()).select_from(Distraction).where(
                Distraction.user_id == user.id, Distraction.occurred_at >= utcnow() - timedelta(days=7))) or 0}


@focus.post("/distractions", response_model=DistractionRead, status_code=201)
def add_distraction(payload: DistractionIn, db: DB, user: CurrentUser):
    ensure_refs_owned(db, user, {FocusSession: payload.session_id})
    d = Distraction(user_id=user.id, description=payload.description, session_id=payload.session_id,
                    occurred_at=utcnow())
    db.add(d)
    db.commit()
    return d


@focus.get("/distractions", response_model=list[DistractionRead])
def list_distractions(db: DB, user: CurrentUser, limit: int = Query(100, ge=1, le=1000)):
    return db.scalars(select(Distraction).where(Distraction.user_id == user.id)
                      .order_by(Distraction.occurred_at.desc()).limit(limit)).all()
