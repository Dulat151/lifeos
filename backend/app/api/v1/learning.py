"""Learning center (subjects, courses, lessons, resources, study sessions), flashcards, books."""
import uuid
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import func, or_, select

from app.api.crud import crud_router
from app.core.deps import DB, CurrentUser, ensure_refs_owned, get_owned
from app.core.time import local_today, user_tz, utcnow
from app.models import (Attachment, Book, BookNote, Course, Deck, Flashcard, FlashcardReview, Goal,
                        LearningResource, LearningSession, Lesson, ReadingSession, Subject)
from app.schemas.more import (BookCreate, BookNoteCreate, BookNoteRead, BookRead, BookUpdate, CardCreate, CardRead,
                              CardUpdate, CourseCreate, CourseRead, CourseUpdate, DeckCreate, DeckRead, DeckUpdate,
                              LearningSessionCreate, LearningSessionRead, LearningSessionUpdate, LessonCreate,
                              LessonRead, LessonUpdate, ReadingSessionCreate, ReadingSessionRead, ResourceCreate,
                              ResourceRead, ResourceUpdate, ReviewIn, SubjectCreate, SubjectRead, SubjectUpdate)
from app.services import gamification as gm
from app.services.activity import log_event
from app.services.sm2 import SM2State, card_stage, review

# ================================================================ Learning
learning = APIRouter(prefix="/learning", tags=["learning"])


def _award_session(db, user, s):
    gm.award(db, user, "learning_session", "learning_session", s.id)
    log_event(db, user.id, "learning_session", "learning_session", s.id, {"minutes": s.duration_minutes})


@learning.get("/dashboard")
def learning_dashboard(db: DB, user: CurrentUser):
    today = local_today(user)
    tz = user_tz(user)
    week_start = today - timedelta(days=today.weekday())
    sessions = db.scalars(select(LearningSession).where(LearningSession.user_id == user.id)).all()

    def mins(since):
        return sum(s.duration_minutes for s in sessions if s.started_at.astimezone(tz).date() >= since)

    by_day = {}
    for i in range(14):
        d = today - timedelta(days=13 - i)
        by_day[d.isoformat()] = 0
    for s in sessions:
        k = s.started_at.astimezone(tz).date().isoformat()
        if k in by_day:
            by_day[k] += s.duration_minutes
    courses = _course_reads(db, user, db.scalars(select(Course).where(
        Course.user_id == user.id, Course.deleted_at.is_(None), Course.status == "active")).all())
    due = db.scalar(select(func.count()).select_from(Flashcard).where(
        Flashcard.user_id == user.id, Flashcard.due_date <= today)) or 0
    return {"minutes_today": mins(today), "minutes_week": mins(week_start),
            "minutes_total": sum(s.duration_minutes for s in sessions), "sessions_total": len(sessions),
            "daily": [{"date": k, "minutes": v} for k, v in by_day.items()],
            "active_courses": courses, "cards_due": due}


def _course_reads(db, user, courses) -> list[CourseRead]:
    ids = [c.id for c in courses]
    les = {}
    mins = {}
    if ids:
        for cid, total, done in db.execute(select(Lesson.course_id, func.count(),
                                                  func.count(Lesson.completed_at)).where(
                Lesson.course_id.in_(ids)).group_by(Lesson.course_id)):
            les[cid] = (total, done)
        for cid, m in db.execute(select(LearningSession.course_id, func.sum(LearningSession.duration_minutes))
                                 .where(LearningSession.course_id.in_(ids)).group_by(LearningSession.course_id)):
            mins[cid] = int(m or 0)
    out = []
    for c in courses:
        r = CourseRead.model_validate(c)
        r.lessons_total, r.lessons_done = les.get(c.id, (0, 0))
        r.progress = 100.0 if c.status == "completed" else (
            round(r.lessons_done / r.lessons_total * 100, 1) if r.lessons_total else 0.0)
        r.minutes_studied = mins.get(c.id, 0)
        out.append(r)
    return out


@learning.get("/courses", response_model=list[CourseRead])
def list_courses(db: DB, user: CurrentUser, subject_id: uuid.UUID | None = None, status: str | None = None):
    stmt = select(Course).where(Course.user_id == user.id, Course.deleted_at.is_(None))
    if subject_id:
        stmt = stmt.where(Course.subject_id == subject_id)
    if status:
        stmt = stmt.where(Course.status == status)
    return _course_reads(db, user, db.scalars(stmt.order_by(Course.path_position, Course.created_at)).all())


@learning.get("/courses/{course_id}/detail")
def course_detail(course_id: uuid.UUID, db: DB, user: CurrentUser):
    c = get_owned(db, Course, course_id, user)
    lessons = db.scalars(select(Lesson).where(Lesson.course_id == c.id).order_by(Lesson.position,
                                                                                Lesson.created_at)).all()
    res = db.scalars(select(LearningResource).where(LearningResource.course_id == c.id)).all()
    sess = db.scalars(select(LearningSession).where(LearningSession.course_id == c.id)
                      .order_by(LearningSession.started_at.desc()).limit(50)).all()
    return {"course": _course_reads(db, user, [c])[0],
            "lessons": [LessonRead.model_validate(x) for x in lessons],
            "resources": [ResourceRead.model_validate(x) for x in res],
            "sessions": [LearningSessionRead.model_validate(x) for x in sess]}


@learning.post("/lessons/{lesson_id}/toggle", response_model=LessonRead)
def toggle_lesson(lesson_id: uuid.UUID, db: DB, user: CurrentUser):
    lsn = get_owned(db, Lesson, lesson_id, user)
    lsn.completed_at = None if lsn.completed_at else utcnow()
    db.commit()
    return lsn


@learning.get("/subjects/{subject_id}/detail")
def subject_detail(subject_id: uuid.UUID, db: DB, user: CurrentUser):
    s = get_owned(db, Subject, subject_id, user)
    minutes = db.scalar(select(func.coalesce(func.sum(LearningSession.duration_minutes), 0)).where(
        LearningSession.user_id == user.id, or_(LearningSession.subject_id == s.id, LearningSession.course_id.in_(
            select(Course.id).where(Course.subject_id == s.id)))))
    return {"subject": SubjectRead.model_validate(s), "courses": list_courses(db, user, subject_id=s.id),
            "minutes_total": int(minutes or 0)}


crud_router(model=Subject, create_schema=SubjectCreate, update_schema=SubjectUpdate, read_schema=SubjectRead,
            tags=["learning"], search_fields=("title",), router=learning, path="/subjects",
            order_by=(Subject.title,))
crud_router(model=Course, create_schema=CourseCreate, update_schema=CourseUpdate, read_schema=CourseRead,
            tags=["learning"], search_fields=("title",), router=learning, path="/courses", skip=("list",),
            ref_models={"subject_id": Subject, "goal_id": Goal}, filter_fields=("status", "subject_id"))
crud_router(model=Lesson, create_schema=LessonCreate, update_schema=LessonUpdate, read_schema=LessonRead,
            tags=["learning"], router=learning, path="/lessons", parent_field="course_id", parent_model=Course,
            order_by=(Lesson.position, Lesson.created_at))
crud_router(model=LearningResource, create_schema=ResourceCreate, update_schema=ResourceUpdate,
            read_schema=ResourceRead, tags=["learning"], router=learning, path="/resources",
            ref_models={"course_id": Course, "lesson_id": Lesson, "attachment_id": Attachment},
            filter_fields=("course_id", "lesson_id", "kind"))
crud_router(model=LearningSession, create_schema=LearningSessionCreate, update_schema=LearningSessionUpdate,
            read_schema=LearningSessionRead, tags=["learning"], router=learning, path="/sessions",
            ref_models={"subject_id": Subject, "course_id": Course, "lesson_id": Lesson},
            filter_fields=("subject_id", "course_id"), order_by=(LearningSession.started_at.desc(),),
            after_create=_award_session)

# ================================================================ Flashcards
flashcards = APIRouter(prefix="/flashcards", tags=["flashcards"])


def _card_read(c) -> CardRead:
    r = CardRead.model_validate(c)
    r.stage = card_stage(c.repetitions, c.interval_days, c.due_date)
    return r


@flashcards.get("/decks", response_model=list[DeckRead])
def list_decks(db: DB, user: CurrentUser):
    today = local_today(user)
    decks = db.scalars(select(Deck).where(Deck.user_id == user.id, Deck.deleted_at.is_(None))
                       .order_by(Deck.created_at)).all()
    out = []
    for d in decks:
        cards = db.scalars(select(Flashcard).where(Flashcard.deck_id == d.id)).all()
        r = DeckRead.model_validate(d)
        r.total = len(cards)
        for c in cards:
            st = card_stage(c.repetitions, c.interval_days, c.due_date)
            setattr(r, st, getattr(r, st) + 1)
            if c.due_date and c.due_date <= today:
                r.due_today += 1
        out.append(r)
    return out


@flashcards.get("/study", response_model=list[CardRead])
def study_queue(db: DB, user: CurrentUser, deck_id: uuid.UUID | None = None, limit: int = Query(50, ge=1, le=500)):
    """Due cards first (oldest due), then new cards up to the deck's daily new-card limit."""
    today = local_today(user)
    base = select(Flashcard).where(Flashcard.user_id == user.id)
    if deck_id:
        get_owned(db, Deck, deck_id, user)
        base = base.where(Flashcard.deck_id == deck_id)
    due = db.scalars(base.where(Flashcard.due_date <= today).order_by(Flashcard.due_date).limit(limit)).all()
    out = list(due)
    if len(out) < limit:
        decks = [get_owned(db, Deck, deck_id, user)] if deck_id else db.scalars(
            select(Deck).where(Deck.user_id == user.id, Deck.deleted_at.is_(None))).all()
        for d in decks:
            introduced_today = db.scalar(select(func.count()).select_from(FlashcardReview).join(
                Flashcard, Flashcard.id == FlashcardReview.card_id).where(
                Flashcard.deck_id == d.id, FlashcardReview.prev_interval == 0,
                FlashcardReview.reviewed_at >= utcnow() - timedelta(hours=24))) or 0
            quota = max(0, d.new_cards_per_day - introduced_today)
            out += db.scalars(select(Flashcard).where(Flashcard.deck_id == d.id, Flashcard.due_date.is_(None))
                              .order_by(Flashcard.created_at).limit(min(quota, limit - len(out)))).all()
            if len(out) >= limit:
                break
    return [_card_read(c) for c in out]


@flashcards.post("/cards/{card_id}/review", response_model=CardRead)
def review_card(card_id: uuid.UUID, payload: ReviewIn, db: DB, user: CurrentUser):
    c = get_owned(db, Flashcard, card_id, user)
    today = local_today(user)
    prev = SM2State(c.ease_factor, c.interval_days, c.repetitions, c.lapses)
    new, due = review(prev, payload.grade, today)
    db.add(FlashcardReview(user_id=user.id, card_id=c.id, grade=payload.grade, reviewed_at=utcnow(),
                           prev_interval=prev.interval_days, new_interval=new.interval_days,
                           prev_ease=prev.ease_factor, new_ease=new.ease_factor))
    c.ease_factor, c.interval_days, c.repetitions, c.lapses = (new.ease_factor, new.interval_days, new.repetitions,
                                                               new.lapses)
    c.due_date, c.last_reviewed_at = due, utcnow()
    db.flush()
    gm.award(db, user, "flashcard_review", "flashcard", c.id, key=f"flashcard_review:{c.id}:{today.isoformat()}")
    db.commit()
    return _card_read(c)


@flashcards.get("/cards", response_model=list[CardRead])
def list_cards(db: DB, user: CurrentUser, deck_id: uuid.UUID, stage: str | None = None, q: str | None = None):
    get_owned(db, Deck, deck_id, user)
    stmt = select(Flashcard).where(Flashcard.deck_id == deck_id, Flashcard.user_id == user.id)
    if q:
        stmt = stmt.where(or_(Flashcard.front.ilike(f"%{q}%"), Flashcard.back.ilike(f"%{q}%")))
    cards = [_card_read(c) for c in db.scalars(stmt.order_by(Flashcard.created_at))]
    return [c for c in cards if not stage or c.stage == stage]


@flashcards.get("/stats")
def fc_stats(db: DB, user: CurrentUser):
    tz = user_tz(user)
    revs = db.scalars(select(FlashcardReview).where(FlashcardReview.user_id == user.id,
                                                    FlashcardReview.reviewed_at >= utcnow() - timedelta(days=30))).all()
    daily: dict = {}
    for r in revs:
        k = r.reviewed_at.astimezone(tz).date().isoformat()
        daily.setdefault(k, {"reviews": 0, "correct": 0})
        daily[k]["reviews"] += 1
        daily[k]["correct"] += r.grade >= 3
    total = len(revs)
    return {"reviews_30d": total, "retention_30d": round(sum(r.grade >= 3 for r in revs) / total * 100, 1)
            if total else 0, "daily": [{"date": k, **v} for k, v in sorted(daily.items())]}


@flashcards.get("/cards/{card_id}/history")
def card_history(card_id: uuid.UUID, db: DB, user: CurrentUser):
    get_owned(db, Flashcard, card_id, user)
    return [{"grade": r.grade, "at": r.reviewed_at.isoformat(), "interval": r.new_interval, "ease": r.new_ease}
            for r in db.scalars(select(FlashcardReview).where(FlashcardReview.card_id == card_id)
                                .order_by(FlashcardReview.reviewed_at.desc()))]


crud_router(model=Deck, create_schema=DeckCreate, update_schema=DeckUpdate, read_schema=DeckRead,
            tags=["flashcards"], router=flashcards, path="/decks", skip=("list",), ref_models={"course_id": Course})
crud_router(model=Flashcard, create_schema=CardCreate, update_schema=CardUpdate, read_schema=CardRead,
            tags=["flashcards"], router=flashcards, path="/cards", skip=("list",), parent_field="deck_id", parent_model=Deck,
            ref_models={"image_attachment_id": Attachment}, search_fields=("front", "back"))

# ================================================================ Books
books = APIRouter(prefix="/books", tags=["books"])


def _book_read(b) -> BookRead:
    r = BookRead.model_validate(b)
    r.progress = 100.0 if b.status == "completed" else (
        round(min(b.current_page / b.total_pages, 1) * 100, 1) if b.total_pages else 0.0)
    return r


def _book_status_side_effects(db, user, b, before: dict):
    if b.status == "completed" and before.get("status") != "completed":
        b.finished_on = b.finished_on or local_today(user)
        if b.total_pages:
            b.current_page = b.total_pages
        gm.award(db, user, "book_completed", "book", b.id)
        log_event(db, user.id, "book_completed", "book", b.id, {"title": b.title})
    elif before.get("status") == "completed" and b.status != "completed":
        gm.revoke(db, user, "book_completed", "book", b.id)
    if b.status == "reading" and not b.started_on:
        b.started_on = local_today(user)
    if b.total_pages and b.current_page > b.total_pages:
        raise HTTPException(422, "Текущая страница больше количества страниц")


@books.get("/stats")
def book_stats(db: DB, user: CurrentUser, year: int | None = None):
    year = year or local_today(user).year
    allb = db.scalars(select(Book).where(Book.user_id == user.id, Book.deleted_at.is_(None))).all()
    sess = db.scalars(select(ReadingSession).where(ReadingSession.user_id == user.id)).all()
    completed_year = [b for b in allb if b.status == "completed" and b.finished_on and b.finished_on.year == year]
    monthly = [{"month": m, "pages": 0, "books": 0} for m in range(1, 13)]
    for s in sess:
        if s.read_on.year == year:
            monthly[s.read_on.month - 1]["pages"] += s.pages
    for b in completed_year:
        monthly[b.finished_on.month - 1]["books"] += 1
    return {"year": year, "books_completed": len(completed_year),
            "books_completed_total": sum(b.status == "completed" for b in allb),
            "pages_read": sum(s.pages for s in sess if s.read_on.year == year),
            "reading_minutes": sum(s.minutes for s in sess if s.read_on.year == year),
            "yearly_goal": user.settings.reading_goal_yearly, "monthly": monthly,
            "by_status": {st: sum(b.status == st for b in allb)
                          for st in ("want_to_read", "reading", "paused", "completed")}}


@books.get("", response_model=list[BookRead])
def list_books(db: DB, user: CurrentUser, status: str | None = None, q: str | None = Query(None, max_length=200)):
    stmt = select(Book).where(Book.user_id == user.id, Book.deleted_at.is_(None))
    if status:
        stmt = stmt.where(Book.status == status)
    if q:
        stmt = stmt.where(or_(Book.title.ilike(f"%{q}%"), Book.author.ilike(f"%{q}%")))
    return [_book_read(b) for b in db.scalars(stmt.order_by(Book.updated_at.desc()))]


@books.post("", response_model=BookRead, status_code=201)
def create_book(payload: BookCreate, db: DB, user: CurrentUser):
    b = Book(**payload.model_dump(), user_id=user.id)
    db.add(b)
    db.flush()
    _book_status_side_effects(db, user, b, {})
    db.commit()
    return _book_read(b)


@books.get("/{book_id}", response_model=BookRead)
def get_book(book_id: uuid.UUID, db: DB, user: CurrentUser):
    return _book_read(get_owned(db, Book, book_id, user))


@books.patch("/{book_id}", response_model=BookRead)
def update_book(book_id: uuid.UUID, payload: BookUpdate, db: DB, user: CurrentUser):
    b = get_owned(db, Book, book_id, user)
    data = payload.model_dump(exclude_unset=True)
    before = {"status": b.status}
    for k, v in data.items():
        setattr(b, k, v)
    _book_status_side_effects(db, user, b, before)
    db.commit()
    return _book_read(b)


@books.delete("/{book_id}", status_code=204)
def delete_book(book_id: uuid.UUID, db: DB, user: CurrentUser):
    get_owned(db, Book, book_id, user).deleted_at = utcnow()
    db.commit()
    return Response(status_code=204)


@books.get("/{book_id}/sessions", response_model=list[ReadingSessionRead])
def book_sessions(book_id: uuid.UUID, db: DB, user: CurrentUser):
    get_owned(db, Book, book_id, user)
    return db.scalars(select(ReadingSession).where(ReadingSession.book_id == book_id)
                      .order_by(ReadingSession.read_on.desc())).all()


@books.post("/{book_id}/sessions", response_model=ReadingSessionRead, status_code=201)
def add_session(book_id: uuid.UUID, payload: ReadingSessionCreate, db: DB, user: CurrentUser):
    """Log a reading session. If end_page is given, pages = end_page - current_page."""
    b = get_owned(db, Book, book_id, user)
    pages = payload.pages
    if payload.end_page is not None:
        if b.total_pages and payload.end_page > b.total_pages:
            raise HTTPException(422, "Страница больше количества страниц в книге")
        pages = max(0, payload.end_page - b.current_page)
        b.current_page = max(b.current_page, payload.end_page)
    else:
        b.current_page = min(b.current_page + pages, b.total_pages or 10**6)
    s = ReadingSession(user_id=user.id, book_id=b.id, read_on=payload.read_on or local_today(user), pages=pages,
                       minutes=payload.minutes, end_page=b.current_page)
    db.add(s)
    before = {"status": b.status}
    if b.status in ("want_to_read", "paused"):
        b.status = "reading"
    if b.total_pages and b.current_page >= b.total_pages:
        b.status = "completed"
    _book_status_side_effects(db, user, b, before)
    db.commit()
    return s


@books.get("/{book_id}/notes", response_model=list[BookNoteRead])
def book_notes(book_id: uuid.UUID, db: DB, user: CurrentUser):
    get_owned(db, Book, book_id, user)
    return db.scalars(select(BookNote).where(BookNote.book_id == book_id).order_by(BookNote.created_at.desc())).all()


@books.post("/{book_id}/notes", response_model=BookNoteRead, status_code=201)
def add_book_note(book_id: uuid.UUID, payload: BookNoteCreate, db: DB, user: CurrentUser):
    get_owned(db, Book, book_id, user)
    n = BookNote(user_id=user.id, book_id=book_id, **payload.model_dump())
    db.add(n)
    db.commit()
    return n


@books.delete("/{book_id}/notes/{note_id}", status_code=204)
def delete_book_note(book_id: uuid.UUID, note_id: uuid.UUID, db: DB, user: CurrentUser):
    n = get_owned(db, BookNote, note_id, user)
    if n.book_id != book_id:
        raise HTTPException(404, "Заметка не найдена")
    db.delete(n)
    db.commit()
    return Response(status_code=204)


__all__ = ["learning", "flashcards", "books", "ensure_refs_owned"]
