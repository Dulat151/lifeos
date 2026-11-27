"""Two-way calendar sync: Google Calendar (OAuth) and CalDAV (iCloud and others).

Algorithm (same for both providers), run on demand and every CALENDAR_SYNC_MINUTES by Celery beat:
1. Pull remote events in the window [now-30d, now+365d].
   - new remote event            -> created locally (external_source = provider)
   - remote changed, local not   -> remote values applied
   - both changed since last sync -> the newer edit wins (remote "updated"/LAST-MODIFIED vs local updated_at)
   - deleted remotely            -> soft-deleted locally
2. Push local changes made since the last sync: edits, deletions and (for one provider) events created in
   LIFE OS. Native LIFE OS events go to Google when it is connected, otherwise to the CalDAV calendar.
Modified single instances of a recurring series are not synced (the series itself is).
"""
import base64
import hashlib
import logging
from datetime import UTC, date, datetime, timedelta
from urllib.parse import quote

import httpx
from cryptography.fernet import Fernet
from icalendar import Calendar, Event, vRecur
from sqlalchemy import or_, select

from app.core.config import settings
from app.core.time import safe_tz, utcnow
from app.models import CalendarEvent, ConnectedAccount, User
from app.services.caldav import CalDAVClient, CalDAVError
from app.services.recurrence import validate_rrule

log = logging.getLogger("lifeos.calendar_sync")
PAST, FUTURE = timedelta(days=30), timedelta(days=365)
FIELDS = ("title", "description", "location", "starts_at", "ends_at", "all_day", "timezone", "recurrence_rule")


class SyncError(RuntimeError):
    def __init__(self, message: str, reconnect: bool = False):
        super().__init__(message)
        self.reconnect = reconnect


# ---------------------------------------------------------------- secrets at rest

def _fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode()).digest()))


def encrypt(v: str) -> str:
    return _fernet().encrypt(v.encode()).decode()


def decrypt(v: str) -> str:
    return _fernet().decrypt(v.encode()).decode()


# ---------------------------------------------------------------- shared helpers

def _stats() -> dict:
    return {"pulled_created": 0, "pulled_updated": 0, "pulled_deleted": 0,
            "pushed_created": 0, "pushed_updated": 0, "pushed_deleted": 0}


def _apply(ev: CalendarEvent, vals: dict) -> bool:
    changed = False
    for k, v in vals.items():
        if getattr(ev, k) != v:
            setattr(ev, k, v)
            changed = True
    return changed


def _local_wins(ev: CalendarEvent, since: datetime | None, remote_updated: datetime | None) -> bool:
    """True when the local copy was edited after the last sync and that edit is newer than the remote one."""
    if not since or ev.updated_at <= since:
        return False
    return remote_updated is None or remote_updated <= ev.updated_at


def _parse_ts(v: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(v) if v else None
    except ValueError:
        return None


def _push_candidates(db, user, sources: list[str], native: bool, now: datetime):
    cond = [CalendarEvent.external_source.in_(sources)]
    if native:
        cond.append(CalendarEvent.external_source.is_(None))
    return db.scalars(select(CalendarEvent).where(
        CalendarEvent.user_id == user.id, or_(*cond),
        or_(CalendarEvent.deleted_at.is_(None), CalendarEvent.external_uid.is_not(None)),
        or_(CalendarEvent.recurrence_rule.is_not(None), CalendarEvent.ends_at >= now - PAST),
        CalendarEvent.starts_at <= now + FUTURE)).all()


def _find(db, user, uid: str) -> CalendarEvent | None:
    return db.scalar(select(CalendarEvent).where(CalendarEvent.user_id == user.id, CalendarEvent.external_uid == uid))


# ================================================================ Google Calendar

def google_access_token(acc: ConnectedAccount) -> str:
    if acc.expires_at and acc.expires_at > utcnow() + timedelta(seconds=60):
        return decrypt(acc.access_token_enc)
    if not acc.refresh_token_enc:
        raise SyncError("Требуется повторное подключение Google", reconnect=True)
    r = httpx.post("https://oauth2.googleapis.com/token", timeout=20, data={
        "client_id": settings.google_client_id, "client_secret": settings.google_client_secret,
        "refresh_token": decrypt(acc.refresh_token_enc), "grant_type": "refresh_token"})
    if r.status_code != 200:
        raise SyncError("Google отозвал доступ — подключите аккаунт заново", reconnect=True)
    tok = r.json()
    acc.access_token_enc = encrypt(tok["access_token"])
    acc.expires_at = utcnow() + timedelta(seconds=int(tok.get("expires_in", 3600)))
    return tok["access_token"]


def from_google(it: dict, default_tz: str) -> dict | None:
    s, e = it.get("start") or {}, it.get("end") or {}
    all_day = "date" in s
    try:
        if all_day:
            starts = datetime.fromisoformat(s["date"]).replace(tzinfo=UTC)
            ends = datetime.fromisoformat(e.get("date") or s["date"]).replace(tzinfo=UTC)
        else:
            starts = datetime.fromisoformat(s["dateTime"])
            ends = datetime.fromisoformat(e.get("dateTime") or s["dateTime"])
    except (KeyError, ValueError):
        return None
    if ends <= starts:
        ends = starts + (timedelta(days=1) if all_day else timedelta(hours=1))
    rule = None
    for line in it.get("recurrence") or []:
        if line.upper().startswith("RRULE:"):
            try:
                rule = validate_rrule(line)
            except ValueError:
                rule = None
    return {"title": (it.get("summary") or "Без названия")[:200], "description": it.get("description") or "",
            "location": (it.get("location") or "")[:200], "starts_at": starts.astimezone(UTC),
            "ends_at": ends.astimezone(UTC), "all_day": all_day,
            "timezone": s.get("timeZone") or default_tz, "recurrence_rule": rule}


def to_google(ev: CalendarEvent) -> dict:
    if ev.all_day:
        sd = ev.starts_at.astimezone(UTC).date()
        ed = max(ev.ends_at.astimezone(UTC).date(), sd + timedelta(days=1))
        start, end = {"date": sd.isoformat()}, {"date": ed.isoformat()}
    else:
        tz = ev.timezone or "UTC"
        start = {"dateTime": ev.starts_at.astimezone(safe_tz(tz)).isoformat(), "timeZone": tz}
        end = {"dateTime": ev.ends_at.astimezone(safe_tz(tz)).isoformat(), "timeZone": tz}
    return {"summary": ev.title, "description": ev.description or "", "location": ev.location or "",
            "start": start, "end": end, "recurrence": [f"RRULE:{ev.recurrence_rule}"] if ev.recurrence_rule else []}


def _google_call(method: str, url: str, token: str, **kw) -> httpx.Response:
    try:
        r = httpx.request(method, url, headers={"Authorization": f"Bearer {token}"}, timeout=30, **kw)
    except httpx.HTTPError as e:
        raise SyncError(f"Google Calendar недоступен: {e.__class__.__name__}") from e
    if r.status_code == 401:
        raise SyncError("Google отозвал доступ — подключите аккаунт заново", reconnect=True)
    if r.status_code == 403 and "insufficient" in r.text.lower():
        raise SyncError("Нет прав на изменение календаря — подключите Google заново", reconnect=True)
    return r


def events_url(cal: str) -> str:
    return f"https://www.googleapis.com/calendar/v3/calendars/{quote(cal, safe='@.')}/events"


def google_uid(cal: str, gid: str) -> str:
    """Primary calendar keeps the historical form google:<id>; other calendars are namespaced."""
    return f"google:{gid}" if cal == "primary" else f"google:{cal}|{gid}"[:255]


def google_selection(acc: ConnectedAccount) -> tuple[list[str], str, dict]:
    m = acc.meta or {}
    return (m.get("calendars") or ["primary"]), m.get("write_calendar") or "primary", m.get("calendars_info") or {}


def list_google_calendars(acc: ConnectedAccount) -> list[dict]:
    token = google_access_token(acc)
    r = _google_call("GET", "https://www.googleapis.com/calendar/v3/users/me/calendarList", token,
                     params={"maxResults": 250})
    if r.status_code != 200:
        raise SyncError(f"Google не вернул список календарей: {r.status_code}")
    return [{"id": "primary" if c.get("primary") else c["id"], "name": c.get("summaryOverride") or c.get("summary") or c["id"],
             "color": c.get("backgroundColor"), "primary": bool(c.get("primary")),
             "writable": c.get("accessRole") in ("owner", "writer")} for c in r.json().get("items", [])]


def sync_google(db, user: User, acc: ConnectedAccount) -> dict:
    if not (settings.google_client_id and settings.google_client_secret):
        raise SyncError("Интеграция Google не настроена на сервере")
    token = google_access_token(acc)
    since, now, stats, touched = acc.last_sync_at, utcnow(), _stats(), set()
    default_tz = user.profile.timezone if user.profile else "UTC"
    selected, write_cal, info = google_selection(acc)

    for cal in selected:
        items, page = [], None
        while True:
            params = {"timeMin": (now - PAST).isoformat(), "timeMax": (now + FUTURE).isoformat(),
                      "singleEvents": "false", "showDeleted": "true", "maxResults": 2500}
            if page:
                params["pageToken"] = page
            r = _google_call("GET", events_url(cal), token, params=params)
            if r.status_code == 404 and cal != "primary":
                break  # calendar removed / unshared in Google
            if r.status_code != 200:
                raise SyncError(f"Ошибка Google Calendar API: {r.status_code}")
            j = r.json()
            items += j.get("items", [])
            page = j.get("nextPageToken")
            if not page:
                break
        ro = not (info.get(cal) or {}).get("writable", True)
        for it in items:
            if it.get("recurringEventId"):
                continue
            uid = google_uid(cal, it["id"])
            ev = _find(db, user, uid)
            if it.get("status") == "cancelled":
                if ev and ev.deleted_at is None:
                    ev.deleted_at, ev.external_uid = now, None  # unlinked: nothing to delete remotely later
                    touched.add(ev.id)
                    stats["pulled_deleted"] += 1
                continue
            vals = from_google(it, default_tz)
            if vals is None:
                continue
            if ev:
                if ev.deleted_at is not None or (not ro and _local_wins(ev, since, _parse_ts(it.get("updated")))):
                    continue
                if _apply(ev, vals):
                    stats["pulled_updated"] += 1
            else:
                color = (info.get(cal) or {}).get("color")
                ev = CalendarEvent(user_id=user.id, external_source="google", external_uid=uid, **vals,
                                   **({"color": color} if color and cal != "primary" else {}))
                db.add(ev)
                db.flush()
                stats["pulled_created"] += 1
            ev.external_meta = {"id": it["id"], "cal": cal, **({"ro": True} if ro else {})}
            touched.add(ev.id)
    db.flush()

    for ev in _push_candidates(db, user, ["google"], native=True, now=now):
        if ev.id in touched:
            continue
        meta = ev.external_meta or {}
        cal = meta.get("cal", "primary") if ev.external_source == "google" else write_cal
        if ev.external_source == "google" and (cal not in selected or meta.get("ro")):
            continue  # read-only (e.g. holidays) or no longer synced
        gid = None
        if ev.external_source == "google" and ev.external_uid:
            gid = meta.get("id") or ev.external_uid[len("google:"):]
        url = events_url(cal)
        if ev.deleted_at is not None:
            if gid:
                r = _google_call("DELETE", f"{url}/{quote(gid)}", token)
                if r.status_code not in (200, 204, 404, 410):
                    raise SyncError(f"Google не удалил событие: {r.status_code}")
                ev.external_uid = None
                stats["pushed_deleted"] += 1
            continue
        if gid:
            if since is not None and ev.updated_at <= since:
                continue  # unchanged locally
            r = _google_call("PATCH", f"{url}/{quote(gid)}", token, json=to_google(ev))
            if r.status_code == 200:
                stats["pushed_updated"] += 1
                continue
            if r.status_code not in (404, 410):
                raise SyncError(f"Google не обновил событие «{ev.title}»: {r.status_code}")
            # removed in Google while edited here -> recreate below
        r = _google_call("POST", url, token, json=to_google(ev))
        if r.status_code != 200:
            raise SyncError(f"Google не создал событие «{ev.title}»: {r.status_code}")
        new_id = r.json()["id"]
        ev.external_source, ev.external_uid = "google", google_uid(cal, new_id)
        ev.external_meta = {"id": new_id, "cal": cal}
        stats["pushed_created"] += 1

    acc.last_sync_at = utcnow()
    acc.meta = {**(acc.meta or {}), "last_error": None}
    return stats


def unlink_google_calendars(db, user, removed: set[str]) -> int:
    """Calendars removed from the selection: their imported copies are removed from LIFE OS (not from Google)."""
    n = 0
    for ev in db.scalars(select(CalendarEvent).where(CalendarEvent.user_id == user.id,
                                                     CalendarEvent.external_source == "google",
                                                     CalendarEvent.deleted_at.is_(None))):
        if (ev.external_meta or {}).get("cal", "primary") in removed:
            ev.deleted_at, ev.external_uid = utcnow(), None
            n += 1
    return n


# ================================================================ CalDAV (iCloud)

def from_vevent(comp, default_tz: str) -> dict | None:
    try:
        ds = comp.decoded("dtstart")
        de = comp.decoded("dtend") if comp.get("dtend") else None
        if de is None and comp.get("duration"):
            de = ds + comp.decoded("duration")
    except (KeyError, ValueError, TypeError):
        return None
    all_day = isinstance(ds, date) and not isinstance(ds, datetime)
    zone = safe_tz(default_tz)
    if all_day:
        ds = datetime(ds.year, ds.month, ds.day, tzinfo=UTC)
        de = datetime(de.year, de.month, de.day, tzinfo=UTC) if isinstance(de, date) else ds + timedelta(days=1)
        tzname = default_tz
    else:
        tzname = getattr(ds.tzinfo, "key", None) or ("UTC" if ds.tzinfo else default_tz)
        ds = ds if ds.tzinfo else ds.replace(tzinfo=zone)
        de = de or ds + timedelta(hours=1)
        de = de if de.tzinfo else de.replace(tzinfo=zone)
    if de <= ds:
        de = ds + (timedelta(days=1) if all_day else timedelta(hours=1))
    rule = None
    if comp.get("rrule"):
        try:
            rule = validate_rrule(comp.get("rrule").to_ical().decode())
        except ValueError:
            rule = None
    return {"title": str(comp.get("summary") or "Без названия")[:200], "description": str(comp.get("description") or ""),
            "location": str(comp.get("location") or "")[:200], "starts_at": ds.astimezone(UTC),
            "ends_at": de.astimezone(UTC), "all_day": all_day, "timezone": tzname, "recurrence_rule": rule}


def to_ical(ev: CalendarEvent, uid: str) -> bytes:
    cal = Calendar()
    cal.add("prodid", "-//LIFE OS//EN")
    cal.add("version", "2.0")
    e = Event()
    e.add("uid", uid)
    e.add("dtstamp", utcnow())
    e.add("last-modified", ev.updated_at or utcnow())
    e.add("summary", ev.title)
    if ev.description:
        e.add("description", ev.description)
    if ev.location:
        e.add("location", ev.location)
    if ev.all_day:
        sd = ev.starts_at.astimezone(UTC).date()
        e.add("dtstart", sd)
        e.add("dtend", max(ev.ends_at.astimezone(UTC).date(), sd + timedelta(days=1)))
    else:
        zone = safe_tz(ev.timezone)
        e.add("dtstart", ev.starts_at.astimezone(zone))
        e.add("dtend", ev.ends_at.astimezone(zone))
    if ev.recurrence_rule:
        e.add("rrule", vRecur.from_ical(ev.recurrence_rule))
    cal.add_component(e)
    if not ev.all_day and (ev.timezone or "UTC") != "UTC":
        cal.add_missing_timezones()
    return cal.to_ical()


def sync_caldav(db, user: User, acc: ConnectedAccount, client: CalDAVClient | None = None) -> dict:
    meta = acc.meta or {}
    cal_url = meta.get("calendar_url")
    if not cal_url:
        raise SyncError("Не выбран календарь CalDAV")
    since, now, stats, touched, seen = acc.last_sync_at, utcnow(), _stats(), set(), set()
    default_tz = user.profile.timezone if user.profile else "UTC"
    push_native = not db.scalar(select(ConnectedAccount.id).where(ConnectedAccount.user_id == user.id,
                                                                  ConnectedAccount.provider == "google"))
    own = client is None
    client = client or CalDAVClient(acc.external_email, decrypt(acc.access_token_enc))
    try:
        for href, etag, data in client.fetch(cal_url, now - PAST, now + FUTURE):
            seen.add(href)
            try:
                masters = [c for c in Calendar.from_ical(data).walk("VEVENT") if not c.get("recurrence-id")]
            except ValueError:
                continue
            if not masters:
                continue
            comp = masters[0]
            uid = str(comp.get("uid") or href)
            vals = from_vevent(comp, default_tz)
            if vals is None:
                continue
            ev = _find(db, user, f"caldav:{uid}"[:255])
            if ev:
                m = ev.external_meta or {}
                if ev.deleted_at is not None:
                    continue
                if etag and m.get("etag") == etag:
                    continue  # unchanged on the server; a local edit (if any) is pushed below
                remote_mod = comp.decoded("last-modified") if comp.get("last-modified") else None
                if _local_wins(ev, since, remote_mod):
                    continue
                if _apply(ev, vals):
                    stats["pulled_updated"] += 1
            else:
                ev = CalendarEvent(user_id=user.id, external_source="caldav", external_uid=f"caldav:{uid}"[:255], **vals)
                db.add(ev)
                db.flush()
                stats["pulled_created"] += 1
            ev.external_meta = {"href": href, "uid": uid, "etag": etag}
            touched.add(ev.id)
        db.flush()

        for ev in db.scalars(select(CalendarEvent).where(
                CalendarEvent.user_id == user.id, CalendarEvent.external_source == "caldav",
                CalendarEvent.deleted_at.is_(None), CalendarEvent.external_uid.is_not(None))):
            href = (ev.external_meta or {}).get("href")
            in_window = ev.recurrence_rule or (ev.ends_at >= now - PAST and ev.starts_at <= now + FUTURE)
            if href and href not in seen and in_window and ev.id not in touched:
                ev.deleted_at, ev.external_uid = now, None
                touched.add(ev.id)
                stats["pulled_deleted"] += 1

        for ev in _push_candidates(db, user, ["caldav"], native=push_native, now=now):
            if ev.id in touched:
                continue
            m = ev.external_meta or {}
            if ev.deleted_at is not None:
                if ev.external_source == "caldav" and m.get("href"):
                    client.delete(m["href"])
                    ev.external_uid = None
                    stats["pushed_deleted"] += 1
                continue
            if ev.external_source is None:
                uid = f"{ev.id}@lifeos"
                href = cal_url.rstrip("/") + "/" + quote(uid) + ".ics"
                etag = client.put(href, to_ical(ev, uid), create=True)
                ev.external_source, ev.external_uid = "caldav", f"caldav:{uid}"
                ev.external_meta = {"href": href, "uid": uid, "etag": etag}
                stats["pushed_created"] += 1
            elif m.get("href") and (since is None or ev.updated_at > since):
                etag = client.put(m["href"], to_ical(ev, m.get("uid") or ev.external_uid[len("caldav:"):]))
                ev.external_meta = {**m, "etag": etag}
                stats["pushed_updated"] += 1
    except CalDAVError as e:
        raise SyncError(str(e)) from e
    finally:
        if own:
            client.close()

    acc.last_sync_at = utcnow()
    acc.meta = {**meta, "last_error": None}
    return stats


# ================================================================ entry points

def sync_account(db, acc: ConnectedAccount, client: CalDAVClient | None = None) -> dict:
    user = db.get(User, acc.user_id)
    if acc.provider == "google":
        return sync_google(db, user, acc)
    if acc.provider == "caldav":
        return sync_caldav(db, user, acc, client)
    raise SyncError(f"Неизвестный провайдер {acc.provider}")


def sync_all(session_factory) -> dict:
    """Celery beat entry point: each account in its own transaction; errors are stored, not raised."""
    with session_factory() as db:
        ids = db.scalars(select(ConnectedAccount.id).where(ConnectedAccount.provider.in_(("google", "caldav")))).all()
    ok = failed = 0
    for acc_id in ids:
        with session_factory() as db:
            acc = db.get(ConnectedAccount, acc_id)
            try:
                sync_account(db, acc)
                db.commit()
                ok += 1
            except Exception as e:  # noqa: BLE001 - one broken account must not stop the others
                db.rollback()
                acc = db.get(ConnectedAccount, acc_id)
                acc.meta = {**(acc.meta or {}), "last_error": str(e)[:300]}
                db.commit()
                failed += 1
                log.warning("calendar sync failed for %s (%s): %s", acc_id, acc.provider, e)
    return {"ok": ok, "failed": failed}
