"""Wheel of Life, Bucket List, Vision Board, Life Timeline, Challenges, Social."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select

from app.api.crud import crud_router
from app.core.deps import DB, CurrentUser, get_current_user, get_owned
from app.core.time import local_today, user_tz, utcnow
from app.models import (ActivityEvent, BucketListItem, Challenge, ChallengeProgress, FocusSession, Goal, Group,
                        GroupMember, Friendship, HabitLog, LearningSession, LifeTimelineEvent, Profile, ReadingSession,
                        SharedGoal, Task, User, UserAchievement, Achievement, VisionBoard, VisionBoardItem,
                        WheelOfLifeEntry, Workout)
from app.schemas.more import (BucketCreate, BucketRead, BucketUpdate, ChallengeCreate, ChallengeRead, TimelineCreate,
                              TimelineRead, TimelineUpdate, VisionBoardCreate, VisionBoardRead, VisionBoardUpdate,
                              VisionItemCreate, VisionItemRead, VisionItemUpdate, WheelCreate, WheelRead, WheelUpdate)
from app.services import gamification as gm

personal = APIRouter(tags=["personal"])


class WheelReadAvg(WheelRead):
    @classmethod
    def model_validate(cls, obj, **kw):
        r = super().model_validate(obj, **kw)
        r.average = round(sum(r.scores.values()) / len(r.scores), 2) if r.scores else 0
        return r


crud_router(model=WheelOfLifeEntry, create_schema=WheelCreate, update_schema=WheelUpdate, read_schema=WheelReadAvg,
            tags=["wheel-of-life"], router=personal, path="/wheel-of-life",
            order_by=(WheelOfLifeEntry.assessed_on.desc(),))


def _bucket_done(db, user, item, before=None):
    if item.status == "done" and (before is None or before.get("status") != "done"):
        item.done_on = item.done_on or local_today(user)
        db.add(LifeTimelineEvent(user_id=user.id, title=item.title, occurred_on=item.done_on, kind="achievement",
                                 source_type="bucket", source_id=item.id))


crud_router(model=BucketListItem, create_schema=BucketCreate, update_schema=BucketUpdate, read_schema=BucketRead,
            tags=["bucket-list"], router=personal, path="/bucket-list", search_fields=("title",),
            filter_fields=("status", "kind", "category"), after_create=lambda db, u, o: _bucket_done(db, u, o),
            after_update=_bucket_done)
crud_router(model=VisionBoard, create_schema=VisionBoardCreate, update_schema=VisionBoardUpdate,
            read_schema=VisionBoardRead, tags=["vision-board"], router=personal, path="/vision-boards")
crud_router(model=VisionBoardItem, create_schema=VisionItemCreate, update_schema=VisionItemUpdate,
            read_schema=VisionItemRead, tags=["vision-board"], router=personal, path="/vision-items",
            parent_field="board_id", parent_model=VisionBoard, ref_models={"goal_id": Goal},
            order_by=(VisionBoardItem.group_label, VisionBoardItem.position))


@personal.get("/timeline")
def timeline(db: DB, user: CurrentUser):
    """Manual events + derived history: completed goals, milestones, books, achievements."""
    from app.models import Book, Milestone

    items = [{"id": str(e.id), "title": e.title, "description": e.description, "date": e.occurred_on.isoformat(),
              "kind": e.kind, "source": e.source_type or "manual", "editable": e.source_type is None}
             for e in db.scalars(select(LifeTimelineEvent).where(LifeTimelineEvent.user_id == user.id))]
    tz = user_tz(user)
    for g in db.scalars(select(Goal).where(Goal.user_id == user.id, Goal.completed_at.is_not(None),
                                           Goal.deleted_at.is_(None))):
        items.append({"id": str(g.id), "title": g.title, "description": "", "kind": "goal", "source": "goal",
                      "date": g.completed_at.astimezone(tz).date().isoformat(), "editable": False})
    for m in db.scalars(select(Milestone).where(Milestone.user_id == user.id, Milestone.completed_at.is_not(None))):
        items.append({"id": str(m.id), "title": m.title, "description": "", "kind": "milestone",
                      "source": "milestone", "date": m.completed_at.astimezone(tz).date().isoformat(),
                      "editable": False})
    for b in db.scalars(select(Book).where(Book.user_id == user.id, Book.status == "completed",
                                           Book.finished_on.is_not(None), Book.deleted_at.is_(None))):
        items.append({"id": str(b.id), "title": f"Прочитана книга «{b.title}»", "description": b.author,
                      "kind": "achievement", "source": "book", "date": b.finished_on.isoformat(), "editable": False})
    for ua, a in db.execute(select(UserAchievement, Achievement).join(
            Achievement, Achievement.id == UserAchievement.achievement_id).where(UserAchievement.user_id == user.id)):
        items.append({"id": str(ua.id), "title": f"Достижение: {a.title_ru}", "description": a.description_ru,
                      "kind": "achievement", "source": "achievement",
                      "date": ua.unlocked_at.astimezone(tz).date().isoformat(), "editable": False})
    items.sort(key=lambda x: x["date"], reverse=True)
    return items


crud_router(model=LifeTimelineEvent, create_schema=TimelineCreate, update_schema=TimelineUpdate,
            read_schema=TimelineRead, tags=["timeline"], router=personal, path="/timeline/events")

# ================================================================ Challenges
challenges = APIRouter(prefix="/challenges", tags=["challenges"])


def challenge_value(db, user_id, c: Challenge, tz) -> int:
    from datetime import datetime, time, timedelta

    s = datetime.combine(c.start_date, time.min, tz)
    e = datetime.combine(c.end_date + timedelta(days=1), time.min, tz)
    q = {
        "tasks_done": select(func.count()).select_from(Task).where(Task.user_id == user_id, Task.status == "done",
                                                                    Task.completed_at >= s, Task.completed_at < e),
        "habit_checks": select(func.count()).select_from(HabitLog).where(
            HabitLog.user_id == user_id, HabitLog.status == "done", HabitLog.log_date >= c.start_date,
            HabitLog.log_date <= c.end_date),
        "focus_minutes": select(func.coalesce(func.sum(FocusSession.focused_seconds), 0) / 60).where(
            FocusSession.user_id == user_id, FocusSession.status == "completed", FocusSession.started_at >= s,
            FocusSession.started_at < e),
        "learning_minutes": select(func.coalesce(func.sum(LearningSession.duration_minutes), 0)).where(
            LearningSession.user_id == user_id, LearningSession.started_at >= s, LearningSession.started_at < e),
        "pages": select(func.coalesce(func.sum(ReadingSession.pages), 0)).where(
            ReadingSession.user_id == user_id, ReadingSession.read_on >= c.start_date,
            ReadingSession.read_on <= c.end_date),
        "workouts": select(func.count()).select_from(Workout).where(
            Workout.user_id == user_id, Workout.is_rest_day.is_(False), Workout.performed_on >= c.start_date,
            Workout.performed_on <= c.end_date),
    }[c.metric]
    return int(db.scalar(q) or 0)


def _visible_challenges(db, user):
    groups = select(GroupMember.group_id).where(GroupMember.user_id == user.id)
    return select(Challenge).where(or_(Challenge.user_id == user.id, Challenge.group_id.in_(groups)))


def _challenge_read(db, user, c) -> ChallengeRead:
    tz = user_tz(user)
    value = challenge_value(db, user.id, c, tz)
    prog = db.scalar(select(ChallengeProgress).where(ChallengeProgress.challenge_id == c.id,
                                                     ChallengeProgress.user_id == user.id))
    if not prog:
        prog = ChallengeProgress(user_id=user.id, challenge_id=c.id)
        db.add(prog)
    prog.value = value
    if value >= c.target and not prog.completed_at:
        prog.completed_at = utcnow()
        gm.award(db, user, "challenge", "challenge", c.id, amount=c.xp_reward)
    r = ChallengeRead.model_validate(c)
    r.value, r.completed_at, r.is_owner = value, prog.completed_at, c.user_id == user.id
    return r


@challenges.get("", response_model=list[ChallengeRead])
def list_challenges(db: DB, user: CurrentUser):
    out = [_challenge_read(db, user, c) for c in db.scalars(_visible_challenges(db, user)
                                                            .order_by(Challenge.end_date.desc()))]
    db.commit()
    return out


@challenges.post("", response_model=ChallengeRead, status_code=201)
def create_challenge(payload: ChallengeCreate, db: DB, user: CurrentUser):
    if payload.end_date < payload.start_date:
        raise HTTPException(422, "Дата окончания раньше начала")
    if payload.group_id:
        _require_member(db, user, payload.group_id)
    c = Challenge(user_id=user.id, **payload.model_dump())
    db.add(c)
    db.flush()
    r = _challenge_read(db, user, c)
    db.commit()
    return r


@challenges.get("/{cid}/leaderboard")
def leaderboard(cid: uuid.UUID, db: DB, user: CurrentUser):
    c = db.scalar(_visible_challenges(db, user).where(Challenge.id == cid))
    if not c:
        raise HTTPException(404, "Челлендж не найден")
    members = [c.user_id]
    if c.group_id:
        members = list(db.scalars(select(GroupMember.user_id).where(GroupMember.group_id == c.group_id)))
    rows = []
    for uid in members:
        u = db.get(User, uid)
        rows.append({"user_id": str(uid), "name": u.profile.name if u.profile else "",
                     "value": challenge_value(db, uid, c, user_tz(u))})
    rows.sort(key=lambda r: -r["value"])
    return {"target": c.target, "metric": c.metric, "rows": rows}


@challenges.delete("/{cid}", status_code=204)
def delete_challenge(cid: uuid.UUID, db: DB, user: CurrentUser):
    db.delete(get_owned(db, Challenge, cid, user))
    db.commit()
    return Response(status_code=204)


# ================================================================ Social (feature-flagged per user)


def social_user(user: CurrentUser) -> User:
    if not user.settings.social_enabled:
        raise HTTPException(403, "Социальные функции отключены в настройках")
    return user


SocialUser = Depends(social_user)
social = APIRouter(prefix="/social", tags=["social"])


def _blocked_between(db, a, b) -> bool:
    return bool(db.scalar(select(Friendship.id).where(
        Friendship.status == "blocked", or_(and_(Friendship.requester_id == a, Friendship.addressee_id == b),
                                            and_(Friendship.requester_id == b, Friendship.addressee_id == a)))))


def _require_member(db, user, group_id):
    if not db.scalar(select(GroupMember.id).where(GroupMember.group_id == group_id, GroupMember.user_id == user.id)):
        raise HTTPException(404, "Группа не найдена")


class FriendRequestIn(BaseModel):
    email: str = Field(max_length=320)


@social.get("/friends")
def friends(db: DB, user: User = SocialUser):
    rows = db.scalars(select(Friendship).where(or_(Friendship.requester_id == user.id,
                                                   Friendship.addressee_id == user.id))).all()
    out = []
    for f in rows:
        other_id = f.addressee_id if f.requester_id == user.id else f.requester_id
        if f.status == "blocked" and f.blocked_by != user.id:
            continue  # the blocked person does not see the block
        other = db.get(User, other_id)
        out.append({"id": str(f.id), "user_id": str(other_id), "name": other.profile.name, "status": f.status,
                    "direction": "outgoing" if f.requester_id == user.id else "incoming"})
    return out


@social.post("/friends/request", status_code=201)
def friend_request(payload: FriendRequestIn, db: DB, user: User = SocialUser):
    other = db.scalar(select(User).where(User.email == payload.email.strip().lower()))
    # Same response for unknown users / users with social disabled / blocked, to prevent enumeration
    generic = {"ok": True}
    if not other or other.id == user.id or not other.settings.social_enabled or _blocked_between(db, user.id, other.id):
        return generic
    exists = db.scalar(select(Friendship).where(or_(
        and_(Friendship.requester_id == user.id, Friendship.addressee_id == other.id),
        and_(Friendship.requester_id == other.id, Friendship.addressee_id == user.id))))
    if not exists:
        db.add(Friendship(requester_id=user.id, addressee_id=other.id, status="pending"))
        db.commit()
    return generic


def _my_friendship(db, user, fid) -> Friendship:
    f = db.get(Friendship, fid)
    if not f or user.id not in (f.requester_id, f.addressee_id):
        raise HTTPException(404, "Не найдено")
    return f


@social.post("/friends/{fid}/accept")
def accept(fid: uuid.UUID, db: DB, user: User = SocialUser):
    f = _my_friendship(db, user, fid)
    if f.addressee_id != user.id or f.status != "pending":
        raise HTTPException(409, "Нельзя принять этот запрос")
    f.status = "accepted"
    db.commit()
    return {"status": f.status}


@social.post("/friends/{fid}/block")
def block(fid: uuid.UUID, db: DB, user: User = SocialUser):
    f = _my_friendship(db, user, fid)
    f.status, f.blocked_by = "blocked", user.id
    db.commit()
    return {"status": "blocked"}


@social.delete("/friends/{fid}", status_code=204)
def remove_friend(fid: uuid.UUID, db: DB, user: User = SocialUser):
    f = _my_friendship(db, user, fid)
    if f.status == "blocked" and f.blocked_by != user.id:
        raise HTTPException(404, "Не найдено")
    db.delete(f)
    db.commit()
    return Response(status_code=204)


def _are_friends(db, a, b) -> bool:
    return bool(db.scalar(select(Friendship.id).where(Friendship.status == "accepted", or_(
        and_(Friendship.requester_id == a, Friendship.addressee_id == b),
        and_(Friendship.requester_id == b, Friendship.addressee_id == a)))))


@social.get("/users/{uid}/profile")
def public_profile(uid: uuid.UUID, db: DB, user: User = SocialUser):
    """Visible only if the target profile is public or you are friends; public achievements only."""
    other = db.get(User, uid)
    if not other or _blocked_between(db, user.id, uid) or not other.settings.social_enabled or not (
            other.profile.is_public or _are_friends(db, user.id, uid)):
        raise HTTPException(404, "Профиль недоступен")
    ach = db.execute(select(Achievement.title_ru, UserAchievement.unlocked_at).join(
        UserAchievement, UserAchievement.achievement_id == Achievement.id).where(
        UserAchievement.user_id == uid, UserAchievement.is_public.is_(True))).all()
    return {"name": other.profile.name, "bio": other.profile.bio, "avatar_url": other.profile.avatar_url,
            "level": gm.level_for_xp(gm.total_xp(db, uid)),
            "achievements": [{"title": t, "at": a.isoformat()} for t, a in ach]}


class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field("", max_length=2000)


@social.get("/groups")
def my_groups(db: DB, user: User = SocialUser):
    rows = db.execute(select(Group, GroupMember.role).join(GroupMember, GroupMember.group_id == Group.id)
                      .where(GroupMember.user_id == user.id)).all()
    return [{"id": str(g.id), "name": g.name, "description": g.description, "role": role,
             "members": db.scalar(select(func.count()).select_from(GroupMember).where(GroupMember.group_id == g.id))}
            for g, role in rows]


@social.post("/groups", status_code=201)
def create_group(payload: GroupIn, db: DB, user: User = SocialUser):
    g = Group(owner_id=user.id, **payload.model_dump())
    db.add(g)
    db.flush()
    db.add(GroupMember(group_id=g.id, user_id=user.id, role="owner"))
    db.commit()
    return {"id": str(g.id), "name": g.name}


class MemberIn(BaseModel):
    user_id: uuid.UUID


@social.post("/groups/{gid}/members", status_code=201)
def add_member(gid: uuid.UUID, payload: MemberIn, db: DB, user: User = SocialUser):
    g = db.get(Group, gid)
    if not g or g.owner_id != user.id:
        raise HTTPException(404, "Группа не найдена")
    if not _are_friends(db, user.id, payload.user_id):
        raise HTTPException(403, "Добавлять можно только друзей")
    if not db.scalar(select(GroupMember.id).where(GroupMember.group_id == gid,
                                                  GroupMember.user_id == payload.user_id)):
        db.add(GroupMember(group_id=gid, user_id=payload.user_id))
    db.commit()
    return {"ok": True}


@social.delete("/groups/{gid}/members/me", status_code=204)
def leave_group(gid: uuid.UUID, db: DB, user: User = SocialUser):
    m = db.scalar(select(GroupMember).where(GroupMember.group_id == gid, GroupMember.user_id == user.id))
    if m:
        db.delete(m)
        db.commit()
    return Response(status_code=204)


class ShareGoalIn(BaseModel):
    user_id: uuid.UUID


@social.post("/goals/{goal_id}/share", status_code=201)
def share_goal(goal_id: uuid.UUID, payload: ShareGoalIn, db: DB, user: User = SocialUser):
    g = get_owned(db, Goal, goal_id, user)
    if not _are_friends(db, user.id, payload.user_id):
        raise HTTPException(403, "Делиться можно только с друзьями")
    if not db.scalar(select(SharedGoal.id).where(SharedGoal.goal_id == g.id,
                                                 SharedGoal.shared_with_id == payload.user_id)):
        db.add(SharedGoal(goal_id=g.id, owner_id=user.id, shared_with_id=payload.user_id))
    db.commit()
    return {"ok": True}


@social.get("/goals/shared-with-me")
def shared_with_me(db: DB, user: User = SocialUser):
    from app.api.v1.goals import goal_progress

    rows = db.execute(select(Goal, SharedGoal.owner_id).join(SharedGoal, SharedGoal.goal_id == Goal.id).where(
        SharedGoal.shared_with_id == user.id, Goal.deleted_at.is_(None))).all()
    out = []
    for g, owner in rows:
        if _blocked_between(db, user.id, owner) or not _are_friends(db, user.id, owner):
            continue
        out.append({"id": str(g.id), "title": g.title, "status": g.status, "progress": goal_progress(db, g),
                    "owner": db.get(Profile, db.scalar(select(Profile.id).where(Profile.user_id == owner))).name})
    return out


@social.get("/feed")
def feed(db: DB, user: User = SocialUser):
    """Public achievements of friends."""
    fr = db.scalars(select(Friendship).where(Friendship.status == "accepted", or_(
        Friendship.requester_id == user.id, Friendship.addressee_id == user.id))).all()
    ids = [f.addressee_id if f.requester_id == user.id else f.requester_id for f in fr]
    if not ids:
        return []
    rows = db.execute(select(UserAchievement, Achievement, Profile).join(
        Achievement, Achievement.id == UserAchievement.achievement_id).join(
        Profile, Profile.user_id == UserAchievement.user_id).where(
        UserAchievement.user_id.in_(ids), UserAchievement.is_public.is_(True))
        .order_by(UserAchievement.unlocked_at.desc()).limit(50)).all()
    return [{"name": p.name, "achievement": a.title_ru, "at": ua.unlocked_at.isoformat()} for ua, a, p in rows]


__all__ = ["personal", "challenges", "social", "date", "ActivityEvent", "get_current_user"]
