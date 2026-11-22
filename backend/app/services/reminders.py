"""Reminder engine — runs on the backend (Celery beat every 30 s, or `python -m app.workers.scheduler`).

1. dispatch_due(): picks active reminders with next_fire_at <= now (FOR UPDATE SKIP LOCKED, safe with several
   workers). Each occurrence creates exactly one Notification (unique dedup_key = reminder id + occurrence time)
   and one NotificationDelivery per channel. Then next_fire_at advances by the RRULE (in the reminder's
   time zone, DST-aware) or the reminder deactivates.
2. process_deliveries(): sends pending deliveries. Failures retry with exponential backoff (1,2,4,8,16 min),
   max 5 attempts. Quiet hours postpone non in-app channels to the end of the quiet window.
   - in_app: stored notification, sent immediately
   - browser: shown by the open app via the Notification API; marked sent when the client fetches it
   - web_push: pywebpush with VAPID keys; without keys -> failed "not configured"
   - email: SMTP; without SMTP -> failed "not configured"
"""
import json
import logging
import uuid
from datetime import datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import safe_tz, utcnow
from app.models import (Notification, NotificationDelivery, PushSubscription, Reminder, User, UserSettings)
from app.services.email import EmailNotConfigured, send_email
from app.services.recurrence import next_after

log = logging.getLogger("lifeos.reminders")
MAX_ATTEMPTS = 5
CHANNELS = ("in_app", "browser", "web_push", "email")


def _parse_hhmm(v: str | None) -> time | None:
    if not v:
        return None
    try:
        h, m = v.split(":")
        return time(int(h), int(m))
    except ValueError:
        return None


def quiet_until(us: UserSettings | None, tz: str, now: datetime) -> datetime | None:
    """If `now` is within the user's quiet hours, returns UTC datetime when quiet hours end."""
    if not us:
        return None
    start, end = _parse_hhmm(us.quiet_hours_start), _parse_hhmm(us.quiet_hours_end)
    if not start or not end or start == end:
        return None
    zone = safe_tz(tz)
    local = now.astimezone(zone)
    t = local.time()
    inside = (start <= t < end) if start < end else (t >= start or t < end)
    if not inside:
        return None
    end_dt = local.replace(hour=end.hour, minute=end.minute, second=0, microsecond=0)
    if end_dt <= local:
        end_dt += timedelta(days=1)
    return end_dt.astimezone(now.tzinfo)


def dispatch_due(db: Session, now: datetime | None = None) -> int:
    now = now or utcnow()
    rows = db.scalars(
        select(Reminder).where(Reminder.is_active.is_(True), Reminder.next_fire_at.is_not(None),
                               Reminder.next_fire_at <= now)
        .order_by(Reminder.next_fire_at).limit(500).with_for_update(skip_locked=True)
    ).all()
    created = 0
    for r in rows:
        occurrence = r.next_fire_at
        user = db.get(User, r.user_id)
        prefs = (user.settings.notification_prefs if user and user.settings else {}) or {}
        tz = user.profile.timezone if user and user.profile else r.timezone
        dedup = f"rem:{r.id}:{occurrence.isoformat()}"
        notif_id = uuid.uuid4()
        res = db.execute(insert(Notification).values(
            id=notif_id, user_id=r.user_id, reminder_id=r.id, title=r.title, body=r.body,
            link=_link_for(r), dedup_key=dedup, created_at=now, updated_at=now,
        ).on_conflict_do_nothing(constraint="uq_notification_dedup").returning(Notification.id)).scalar()
        if res is not None:
            created += 1
            qu = quiet_until(user.settings if user else None, tz, now)
            for ch in dict.fromkeys(r.channels or ["in_app"]):
                if ch not in CHANNELS:
                    continue
                disabled = prefs.get(ch) is False
                db.add(NotificationDelivery(
                    user_id=r.user_id, notification_id=notif_id, channel=ch,
                    status="skipped" if disabled else "pending",
                    last_error="Канал отключён в настройках" if disabled else None,
                    next_attempt_at=(qu if (qu and ch not in ("in_app", "browser")) else now),
                ))
        r.last_fired_at = occurrence
        if r.recurrence_rule:
            r.next_fire_at = next_after(r.recurrence_rule, r.first_fire_at, r.timezone, max(occurrence, now))
            if r.next_fire_at is None:
                r.is_active = False
        else:
            r.next_fire_at = None
            r.is_active = False
    db.commit()
    return created


def _link_for(r: Reminder) -> str | None:
    paths = {"task": "/tasks", "habit": "/habits", "goal": "/goals", "event": "/calendar", "learning": "/learning",
             "workout": "/health", "payment": "/finance", "daily_review": "/journal", "weekly_review": "/journal"}
    return paths.get(r.kind)


def _send(db: Session, d: NotificationDelivery, n: Notification) -> None:
    if d.channel == "in_app":
        return
    if d.channel == "browser":
        raise _Defer()
    user = db.get(User, d.user_id)
    if d.channel == "email":
        send_email(user.email, n.title, f"{n.body}\n\n{settings.frontend_url}{n.link or ''}")
        return
    if d.channel == "web_push":
        if not settings.vapid_private_key:
            raise EmailNotConfigured("Web Push не настроен (VAPID ключи отсутствуют)")
        from pywebpush import WebPushException, webpush

        subs = db.scalars(select(PushSubscription).where(PushSubscription.user_id == d.user_id)).all()
        if not subs:
            raise EmailNotConfigured("Нет подписок Web Push у пользователя")
        payload = json.dumps({"title": n.title, "body": n.body, "url": n.link or "/"})
        ok = False
        for s in subs:
            try:
                webpush({"endpoint": s.endpoint, "keys": s.keys}, payload,
                        vapid_private_key=settings.vapid_private_key,
                        vapid_claims={"sub": settings.vapid_subject})
                ok = True
            except WebPushException as e:
                if e.response is not None and e.response.status_code in (404, 410):
                    db.delete(s)  # subscription expired
        if not ok:
            raise RuntimeError("Не удалось доставить ни на одну подписку")


class _Defer(Exception):
    pass


def process_deliveries(db: Session, now: datetime | None = None) -> dict:
    now = now or utcnow()
    rows = db.scalars(
        select(NotificationDelivery).where(NotificationDelivery.status == "pending",
                                           NotificationDelivery.next_attempt_at <= now)
        .limit(500).with_for_update(skip_locked=True)
    ).all()
    stats = {"sent": 0, "failed": 0, "retry": 0}
    for d in rows:
        n = db.get(Notification, d.notification_id)
        try:
            _send(db, d, n)
            d.status, d.sent_at, d.last_error = "sent", now, None
            d.attempts += 1
            stats["sent"] += 1
        except _Defer:
            d.next_attempt_at = None  # waits for the client to pick it up
        except EmailNotConfigured as e:
            d.attempts += 1
            d.status, d.last_error = "failed", str(e)
            stats["failed"] += 1
        except Exception as e:  # noqa: BLE001
            d.attempts += 1
            d.last_error = str(e)[:500]
            if d.attempts >= MAX_ATTEMPTS:
                d.status = "failed"
                stats["failed"] += 1
            else:
                d.next_attempt_at = now + timedelta(minutes=2 ** (d.attempts - 1))
                stats["retry"] += 1
            log.warning("Delivery %s failed (attempt %s): %s", d.id, d.attempts, e)
    db.commit()
    return stats


def compute_initial_next(r: Reminder, now: datetime) -> datetime | None:
    """One-off: first_fire_at (fires immediately if in the past). Recurring: the first occurrence not older than
    the 10-minute grace window, so long-missed occurrences are not replayed."""
    grace = now - timedelta(minutes=10)
    if r.first_fire_at >= grace or not r.recurrence_rule:
        return r.first_fire_at
    return next_after(r.recurrence_rule, r.first_fire_at, r.timezone, grace)
