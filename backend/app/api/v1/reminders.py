import uuid
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import func, select, update

from app.core.config import settings
from app.core.deps import DB, CurrentUser, get_owned
from app.core.time import utcnow
from app.models import Notification, NotificationDelivery, PushSubscription, Reminder
from app.schemas import (DeliveryRead, NotificationRead, PushSubIn, ReminderCreate, ReminderRead, ReminderUpdate,
                         RescheduleIn, SnoozeIn)
from app.services.reminders import compute_initial_next

router = APIRouter(tags=["reminders"])


@router.get("/reminders", response_model=list[ReminderRead])
def list_reminders(db: DB, user: CurrentUser, active: bool | None = None, kind: str | None = None):
    stmt = select(Reminder).where(Reminder.user_id == user.id)
    if active is not None:
        stmt = stmt.where(Reminder.is_active.is_(active))
    if kind:
        stmt = stmt.where(Reminder.kind == kind)
    return db.scalars(stmt.order_by(Reminder.next_fire_at.asc().nulls_last())).all()


@router.post("/reminders", response_model=ReminderRead, status_code=201)
def create_reminder(payload: ReminderCreate, db: DB, user: CurrentUser):
    if payload.first_fire_at.tzinfo is None:
        raise HTTPException(422, "first_fire_at должен содержать часовой пояс")
    r = Reminder(**payload.model_dump(), user_id=user.id)
    r.next_fire_at = compute_initial_next(r, utcnow()) if r.is_active else None
    db.add(r)
    db.commit()
    return r


@router.patch("/reminders/{rid}", response_model=ReminderRead)
def update_reminder(rid: uuid.UUID, payload: ReminderUpdate, db: DB, user: CurrentUser):
    r = get_owned(db, Reminder, rid, user)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(r, k, v)
    if {"first_fire_at", "recurrence_rule", "is_active", "timezone"} & data.keys():
        r.next_fire_at = compute_initial_next(r, utcnow()) if r.is_active else None
    db.commit()
    return r


@router.post("/reminders/{rid}/snooze", response_model=ReminderRead)
def snooze(rid: uuid.UUID, payload: SnoozeIn, db: DB, user: CurrentUser):
    r = get_owned(db, Reminder, rid, user)
    r.next_fire_at = utcnow() + timedelta(minutes=payload.minutes)
    r.is_active = True
    db.commit()
    return r


@router.post("/reminders/{rid}/reschedule", response_model=ReminderRead)
def reschedule(rid: uuid.UUID, payload: RescheduleIn, db: DB, user: CurrentUser):
    if payload.fire_at.tzinfo is None:
        raise HTTPException(422, "fire_at должен содержать часовой пояс")
    r = get_owned(db, Reminder, rid, user)
    r.next_fire_at = payload.fire_at
    if not r.recurrence_rule:
        r.first_fire_at = payload.fire_at
    r.is_active = True
    db.commit()
    return r


@router.delete("/reminders/{rid}", status_code=204)
def delete_reminder(rid: uuid.UUID, db: DB, user: CurrentUser):
    db.delete(get_owned(db, Reminder, rid, user))
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- notifications


@router.get("/notifications", response_model=list[NotificationRead])
def list_notifications(db: DB, user: CurrentUser, unread: bool = False, limit: int = Query(50, ge=1, le=200)):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread:
        stmt = stmt.where(Notification.read_at.is_(None))
    return db.scalars(stmt.order_by(Notification.created_at.desc()).limit(limit)).all()


@router.get("/notifications/unread-count")
def unread_count(db: DB, user: CurrentUser):
    n = db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user.id,
                                                                        Notification.read_at.is_(None)))
    return {"count": n or 0}


@router.post("/notifications/browser-pending", response_model=list[NotificationRead])
def browser_pending(db: DB, user: CurrentUser):
    """The open app polls this to show system notifications (Notification API); marks those deliveries sent."""
    rows = db.execute(select(NotificationDelivery, Notification).join(
        Notification, Notification.id == NotificationDelivery.notification_id).where(
        NotificationDelivery.user_id == user.id, NotificationDelivery.channel == "browser",
        NotificationDelivery.status == "pending")).all()
    out = []
    now = utcnow()
    for d, n in rows:
        d.status, d.sent_at, d.attempts = "sent", now, d.attempts + 1
        out.append(n)
    db.commit()
    return out


@router.post("/notifications/{nid}/read", response_model=NotificationRead)
def mark_read(nid: uuid.UUID, db: DB, user: CurrentUser):
    n = get_owned(db, Notification, nid, user)
    n.read_at = n.read_at or utcnow()
    db.commit()
    return n


@router.post("/notifications/read-all")
def read_all(db: DB, user: CurrentUser):
    res = db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
                     .values(read_at=utcnow()))
    db.commit()
    return {"updated": res.rowcount}


@router.get("/notifications/deliveries", response_model=list[DeliveryRead])
def deliveries(db: DB, user: CurrentUser, status: str | None = None, limit: int = Query(100, ge=1, le=500)):
    stmt = select(NotificationDelivery).where(NotificationDelivery.user_id == user.id)
    if status:
        stmt = stmt.where(NotificationDelivery.status == status)
    return db.scalars(stmt.order_by(NotificationDelivery.created_at.desc()).limit(limit)).all()


@router.post("/notifications/deliveries/{did}/retry", response_model=DeliveryRead)
def retry_delivery(did: uuid.UUID, db: DB, user: CurrentUser):
    d = get_owned(db, NotificationDelivery, did, user)
    if d.status != "failed":
        raise HTTPException(409, "Повторить можно только неудавшуюся доставку")
    d.status, d.next_attempt_at, d.attempts = "pending", utcnow(), 0
    db.commit()
    return d


@router.get("/notifications/channels")
def channels_status():
    return {"in_app": True, "browser": True, "web_push": bool(settings.vapid_public_key),
            "email": bool(settings.smtp_host), "vapid_public_key": settings.vapid_public_key or None}


@router.post("/notifications/push-subscriptions", status_code=201)
def add_push_sub(payload: PushSubIn, db: DB, user: CurrentUser):
    if not settings.vapid_public_key:
        raise HTTPException(503, "Web Push не настроен на сервере (VAPID ключи)")
    existing = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    if existing:
        existing.user_id, existing.keys = user.id, payload.keys
    else:
        db.add(PushSubscription(user_id=user.id, endpoint=payload.endpoint, keys=payload.keys))
    db.commit()
    return {"ok": True}
