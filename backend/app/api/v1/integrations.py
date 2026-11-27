"""Calendar integrations: Google Calendar (OAuth 2.0) and CalDAV (Apple iCloud and other servers), two-way sync.
Without GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET the Google endpoints return 503 with an explanation —
success is never simulated. Sync logic lives in app.services.calendar_sync."""
import secrets
from datetime import timedelta

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import DB, CurrentUser
from app.core.time import utcnow
from app.models import ConnectedAccount
from app.services.caldav import ICLOUD_URL, CalDAVClient, CalDAVError, check_url
from app.services.calendar_sync import (
    SyncError,
    encrypt,
    list_google_calendars,
    sync_account,
    unlink_google_calendars,
)

router = APIRouter(prefix="/integrations", tags=["integrations"])
SCOPE = "https://www.googleapis.com/auth/calendar.events openid email"
STATE_COOKIE = "lifeos_oauth_state"


def _google_configured() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def _require_google():
    if not _google_configured():
        raise HTTPException(503, "Интеграция Google не настроена: задайте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET")


def _account(db, user, provider: str) -> ConnectedAccount | None:
    return db.scalar(select(ConnectedAccount).where(ConnectedAccount.user_id == user.id,
                                                    ConnectedAccount.provider == provider))


def _status(acc: ConnectedAccount | None) -> dict:
    meta = (acc.meta or {}) if acc else {}
    return {"connected": bool(acc), "email": acc.external_email if acc else None,
            "last_sync_at": acc.last_sync_at.isoformat() if acc and acc.last_sync_at else None,
            "last_error": meta.get("last_error")}


def _run_sync(db, acc: ConnectedAccount, client: CalDAVClient | None = None) -> dict:
    try:
        stats = sync_account(db, acc, client)
    except SyncError as e:
        db.rollback()
        acc.meta = {**(acc.meta or {}), "last_error": str(e)}
        db.commit()
        raise HTTPException(401 if e.reconnect else 502, str(e)) from None
    db.commit()
    return stats


# Registry of external services. "available" = really implemented; "planned" = shown honestly as not yet
# available (no fake connect button). Adding a service = one entry here + its endpoints; the UI renders the list.
CATALOG = [
    {"id": "google_calendar", "name": "Google Calendar", "category": "calendar", "status": "available",
     "description": "Двусторонняя синхронизация событий, выбор календарей, создание событий в Google из LIFE OS."},
    {"id": "apple_calendar", "name": "Apple iCloud Календарь", "category": "calendar", "status": "available",
     "description": "Двусторонняя синхронизация через CalDAV с паролем приложения Apple. Подходит и для "
                    "Fastmail, Nextcloud, Яндекса."},
    {"id": "google_keep", "name": "Google Keep", "category": "notes", "status": "import",
     "description": "Импорт заметок из архива Google Takeout. API Keep для личных аккаунтов Google не существует."},
    {"id": "apple_notes", "name": "Apple Notes", "category": "notes", "status": "import",
     "description": "Импорт заметок (скрипт экспорта для Mac или Markdown). У Apple Notes нет веб-API."},
    {"id": "google_tasks", "name": "Google Tasks", "category": "tasks", "status": "planned",
     "description": "Синхронизация задач с Google Tasks. Пока не реализовано."},
    {"id": "google_drive", "name": "Google Drive", "category": "files", "status": "planned",
     "description": "Прикрепление файлов из Google Drive к задачам и заметкам. Пока не реализовано."},
    {"id": "notion", "name": "Notion", "category": "notes", "status": "planned",
     "description": "Импорт страниц и баз Notion. Пока не реализовано."},
    {"id": "todoist", "name": "Todoist", "category": "tasks", "status": "planned",
     "description": "Импорт и синхронизация задач Todoist. Пока не реализовано."},
    {"id": "telegram", "name": "Telegram", "category": "notifications", "status": "planned",
     "description": "Напоминания и быстрые заметки через Telegram-бота. Пока не реализовано."},
]


@router.get("/catalog")
def catalog(db: DB, user: CurrentUser):
    state = list_integrations(db, user)
    out = []
    for it in CATALOG:
        connected, configured = False, True
        if it["id"] == "google_calendar":
            connected, configured = state["google"]["connected"], state["google"]["configured"]
        elif it["id"] == "apple_calendar":
            connected = state["caldav"]["connected"]
        out.append({**it, "connected": connected, "configured": configured})
    return out


@router.get("")
def list_integrations(db: DB, user: CurrentUser):
    g, c = _account(db, user, "google"), _account(db, user, "caldav")
    cmeta = (c.meta or {}) if c else {}
    gmeta = (g.meta or {}) if g else {}
    return {"google": {"configured": _google_configured(), **_status(g),
                       "calendars": gmeta.get("calendars") or (["primary"] if g else []),
                       "write_calendar": gmeta.get("write_calendar") or ("primary" if g else None)},
            "caldav": {**_status(c), "server_url": cmeta.get("server_url"), "calendar_name": cmeta.get("calendar_name")},
            "sync_minutes": settings.calendar_sync_minutes}


# ---------------------------------------------------------------- Google

@router.get("/google/connect")
def google_connect(user: CurrentUser):
    _require_google()
    state = f"{user.id}.{secrets.token_urlsafe(24)}"
    url = str(httpx.URL("https://accounts.google.com/o/oauth2/v2/auth", params={
        "client_id": settings.google_client_id, "redirect_uri": settings.google_redirect, "response_type": "code",
        "scope": SCOPE, "access_type": "offline", "prompt": "consent", "include_granted_scopes": "true",
        "state": state}))
    resp = Response(content=f'{{"url": "{url}"}}', media_type="application/json")
    resp.set_cookie(STATE_COOKIE, state, httponly=True, max_age=600, samesite="lax", secure=settings.cookie_secure)
    return resp


@router.get("/google/callback")
def google_callback(request: Request, db: DB, user: CurrentUser, code: str = "", state: str = "", error: str = ""):
    _require_google()
    if error:
        return RedirectResponse(f"{settings.frontend_url}/settings?google=denied#integrations")
    if not state or state != request.cookies.get(STATE_COOKIE) or not state.startswith(str(user.id)):
        raise HTTPException(400, "Неверный state OAuth")
    r = httpx.post("https://oauth2.googleapis.com/token", timeout=20, data={
        "code": code, "client_id": settings.google_client_id, "client_secret": settings.google_client_secret,
        "redirect_uri": settings.google_redirect, "grant_type": "authorization_code"})
    if r.status_code != 200:
        raise HTTPException(502, "Google отклонил код авторизации")
    tok = r.json()
    if "calendar.events" not in tok.get("scope", ""):
        return RedirectResponse(f"{settings.frontend_url}/settings?google=scope#integrations")
    email = ""
    info = httpx.get("https://openidconnect.googleapis.com/v1/userinfo", timeout=20,
                     headers={"Authorization": f"Bearer {tok['access_token']}"})
    if info.status_code == 200:
        email = info.json().get("email", "")
    acc = _account(db, user, "google")
    if not acc:
        acc = ConnectedAccount(user_id=user.id, provider="google", access_token_enc="", meta={})
        db.add(acc)
    acc.access_token_enc = encrypt(tok["access_token"])
    if tok.get("refresh_token"):
        acc.refresh_token_enc = encrypt(tok["refresh_token"])
    acc.expires_at = utcnow() + timedelta(seconds=int(tok.get("expires_in", 3600)))
    acc.scope = tok.get("scope", "")
    acc.external_email = email
    acc.meta = {**(acc.meta or {}), "last_error": None}
    db.commit()
    try:
        sync_account(db, acc)
        db.commit()
    except Exception as e:  # noqa: BLE001 - connection succeeded; the error is shown in settings
        db.rollback()
        acc.meta = {**(acc.meta or {}), "last_error": str(e)[:300]}
        db.commit()
    resp = RedirectResponse(f"{settings.frontend_url}/settings?google=connected#integrations")
    resp.delete_cookie(STATE_COOKIE)
    return resp


@router.post("/google/sync")
def google_sync(db: DB, user: CurrentUser):
    _require_google()
    acc = _account(db, user, "google")
    if not acc:
        raise HTTPException(404, "Google не подключён")
    return _run_sync(db, acc)


@router.get("/google/calendars")
def google_calendars(db: DB, user: CurrentUser):
    """Calendars of the connected Google account and which of them LIFE OS syncs."""
    _require_google()
    acc = _account(db, user, "google")
    if not acc:
        raise HTTPException(404, "Google не подключён")
    try:
        cals = list_google_calendars(acc)
    except SyncError as e:
        db.commit()
        raise HTTPException(401 if e.reconnect else 502, str(e)) from None
    db.commit()  # token refresh
    m = acc.meta or {}
    return {"calendars": cals, "selected": m.get("calendars") or ["primary"],
            "write_calendar": m.get("write_calendar") or "primary"}


class GoogleCalendarsIn(BaseModel):
    selected: list[str] = Field(min_length=1, max_length=50)
    write_calendar: str = "primary"


@router.put("/google/calendars")
def set_google_calendars(payload: GoogleCalendarsIn, db: DB, user: CurrentUser):
    _require_google()
    acc = _account(db, user, "google")
    if not acc:
        raise HTTPException(404, "Google не подключён")
    try:
        cals = {c["id"]: c for c in list_google_calendars(acc)}
    except SyncError as e:
        raise HTTPException(401 if e.reconnect else 502, str(e)) from None
    selected = list(dict.fromkeys(c for c in payload.selected if c in cals))
    if not selected:
        raise HTTPException(422, "Выберите хотя бы один календарь")
    if payload.write_calendar not in selected or not cals[payload.write_calendar]["writable"]:
        raise HTTPException(422, "Календарь для новых событий должен быть выбран и доступен для записи")
    m = acc.meta or {}
    removed = set(m.get("calendars") or ["primary"]) - set(selected)
    unlink_google_calendars(db, user, removed)
    acc.meta = {**m, "calendars": selected, "write_calendar": payload.write_calendar,
                "calendars_info": {c: {"name": cals[c]["name"], "color": cals[c]["color"],
                                       "writable": cals[c]["writable"]} for c in selected}}
    db.commit()
    stats = _run_sync(db, acc)
    return {"selected": selected, "write_calendar": payload.write_calendar, "removed": sorted(removed), **stats}


@router.delete("/google", status_code=204)
def google_disconnect(db: DB, user: CurrentUser):
    acc = _account(db, user, "google")
    if acc:
        db.delete(acc)
        db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- CalDAV (iCloud)

class CalDAVLogin(BaseModel):
    server_url: str = Field(ICLOUD_URL, max_length=500)
    username: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=200)


class CalDAVConnect(CalDAVLogin):
    calendar_url: str = Field(min_length=1, max_length=1000)
    calendar_name: str = Field("", max_length=200)


def _client(payload: CalDAVLogin) -> CalDAVClient:
    return CalDAVClient(payload.username.strip(), payload.password.strip())


@router.post("/caldav/discover")
def caldav_discover(payload: CalDAVLogin, user: CurrentUser):
    """Checks the login and lists calendars. Nothing is stored."""
    try:
        with _client(payload) as c:
            cals = c.discover(payload.server_url.strip() or ICLOUD_URL)
    except CalDAVError as e:
        raise HTTPException(400, str(e)) from None
    if not cals:
        raise HTTPException(404, "На сервере не найдено календарей с событиями")
    return {"calendars": cals}


@router.post("/caldav")
def caldav_connect(payload: CalDAVConnect, db: DB, user: CurrentUser):
    server = payload.server_url.strip() or ICLOUD_URL
    try:
        check_url(server)
        check_url(payload.calendar_url)
    except CalDAVError as e:
        raise HTTPException(400, str(e)) from None
    if httpx.URL(payload.calendar_url).host.split(".")[-2:] != httpx.URL(server).host.split(".")[-2:]:
        raise HTTPException(400, "Календарь должен быть на том же сервере")
    acc = _account(db, user, "caldav")
    is_new = acc is None
    if is_new:
        acc = ConnectedAccount(user_id=user.id, provider="caldav", access_token_enc="", meta={})
        db.add(acc)
    elif (acc.meta or {}).get("calendar_url") != payload.calendar_url:
        acc.last_sync_at = None  # another calendar: start over
    acc.external_email = payload.username.strip()
    acc.access_token_enc = encrypt(payload.password.strip())
    acc.meta = {"server_url": server, "calendar_url": payload.calendar_url,
                "calendar_name": payload.calendar_name or "Календарь", "last_error": None}
    db.commit()
    try:
        stats = sync_account(db, acc)
    except SyncError as e:
        db.rollback()
        if is_new:
            db.delete(acc)  # do not keep an account whose login does not work
        db.commit()
        raise HTTPException(400, str(e)) from None
    db.commit()
    return stats


@router.post("/caldav/sync")
def caldav_sync(db: DB, user: CurrentUser):
    acc = _account(db, user, "caldav")
    if not acc:
        raise HTTPException(404, "CalDAV-календарь не подключён")
    return _run_sync(db, acc)


@router.delete("/caldav", status_code=204)
def caldav_disconnect(db: DB, user: CurrentUser):
    acc = _account(db, user, "caldav")
    if acc:
        db.delete(acc)
        db.commit()
    return Response(status_code=204)
