"""Google Calendar integration (OAuth 2.0, read-only import of the primary calendar).
Without GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET every endpoint returns 503 with an explanation —
success is never simulated."""
import base64
import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import httpx
from cryptography.fernet import Fernet
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import DB, CurrentUser
from app.models import CalendarEvent, ConnectedAccount

router = APIRouter(prefix="/integrations", tags=["integrations"])
SCOPE = "https://www.googleapis.com/auth/calendar.readonly openid email"
STATE_COOKIE = "lifeos_oauth_state"


def _fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode()).digest()))


def encrypt(v: str) -> str:
    return _fernet().encrypt(v.encode()).decode()


def decrypt(v: str) -> str:
    return _fernet().decrypt(v.encode()).decode()


def _require_config():
    if not (settings.google_client_id and settings.google_client_secret):
        raise HTTPException(503, "Интеграция Google не настроена: задайте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET")


@router.get("")
def list_integrations(db: DB, user: CurrentUser):
    acc = db.scalar(select(ConnectedAccount).where(ConnectedAccount.user_id == user.id,
                                                   ConnectedAccount.provider == "google"))
    return {"google": {"configured": bool(settings.google_client_id and settings.google_client_secret),
                       "connected": bool(acc), "email": acc.external_email if acc else None,
                       "last_sync_at": acc.last_sync_at.isoformat() if acc and acc.last_sync_at else None}}


@router.get("/google/connect")
def connect(user: CurrentUser):
    _require_config()
    state = f"{user.id}.{secrets.token_urlsafe(24)}"
    url = str(httpx.URL("https://accounts.google.com/o/oauth2/v2/auth", params={
        "client_id": settings.google_client_id, "redirect_uri": settings.google_redirect_uri, "response_type": "code",
        "scope": SCOPE, "access_type": "offline", "prompt": "consent", "state": state}))
    resp = Response(content=f'{{"url": "{url}"}}', media_type="application/json")
    resp.set_cookie(STATE_COOKIE, state, httponly=True, max_age=600, samesite="lax", secure=settings.cookie_secure)
    return resp


@router.get("/google/callback")
def callback(request: Request, db: DB, user: CurrentUser, code: str = "", state: str = ""):
    _require_config()
    if not state or state != request.cookies.get(STATE_COOKIE) or not state.startswith(str(user.id)):
        raise HTTPException(400, "Неверный state OAuth")
    r = httpx.post("https://oauth2.googleapis.com/token", timeout=20, data={
        "code": code, "client_id": settings.google_client_id, "client_secret": settings.google_client_secret,
        "redirect_uri": settings.google_redirect_uri, "grant_type": "authorization_code"})
    if r.status_code != 200:
        raise HTTPException(502, "Google отклонил код авторизации")
    tok = r.json()
    acc = db.scalar(select(ConnectedAccount).where(ConnectedAccount.user_id == user.id,
                                                   ConnectedAccount.provider == "google"))
    if not acc:
        acc = ConnectedAccount(user_id=user.id, provider="google", access_token_enc="")
        db.add(acc)
    acc.access_token_enc = encrypt(tok["access_token"])
    if tok.get("refresh_token"):
        acc.refresh_token_enc = encrypt(tok["refresh_token"])
    acc.expires_at = datetime.now(UTC) + timedelta(seconds=int(tok.get("expires_in", 3600)))
    acc.scope = tok.get("scope", "")
    db.commit()
    return RedirectResponse(f"{settings.frontend_url}/settings?google=connected")


def _access_token(db, acc: ConnectedAccount) -> str:
    if acc.expires_at and acc.expires_at > datetime.now(UTC) + timedelta(seconds=60):
        return decrypt(acc.access_token_enc)
    if not acc.refresh_token_enc:
        raise HTTPException(401, "Требуется повторное подключение Google")
    r = httpx.post("https://oauth2.googleapis.com/token", timeout=20, data={
        "client_id": settings.google_client_id, "client_secret": settings.google_client_secret,
        "refresh_token": decrypt(acc.refresh_token_enc), "grant_type": "refresh_token"})
    if r.status_code != 200:
        raise HTTPException(401, "Требуется повторное подключение Google")
    tok = r.json()
    acc.access_token_enc = encrypt(tok["access_token"])
    acc.expires_at = datetime.now(UTC) + timedelta(seconds=int(tok.get("expires_in", 3600)))
    return tok["access_token"]


@router.post("/google/sync")
def sync(db: DB, user: CurrentUser):
    _require_config()
    acc = db.scalar(select(ConnectedAccount).where(ConnectedAccount.user_id == user.id,
                                                   ConnectedAccount.provider == "google"))
    if not acc:
        raise HTTPException(404, "Google не подключён")
    token = _access_token(db, acc)
    now = datetime.now(UTC)
    r = httpx.get("https://www.googleapis.com/calendar/v3/calendars/primary/events", timeout=30,
                  headers={"Authorization": f"Bearer {token}"},
                  params={"timeMin": (now - timedelta(days=30)).isoformat(), "timeMax": (now + timedelta(days=180))
                          .isoformat(), "singleEvents": "true", "maxResults": 2500})
    if r.status_code != 200:
        raise HTTPException(502, f"Ошибка Google Calendar API: {r.status_code}")
    created = updated = 0
    for it in r.json().get("items", []):
        if it.get("status") == "cancelled":
            continue
        s, e = it.get("start", {}), it.get("end", {})
        all_day = "date" in s
        try:
            starts = datetime.fromisoformat(s.get("dateTime") or f"{s['date']}T00:00:00+00:00")
            ends = datetime.fromisoformat(e.get("dateTime") or f"{e['date']}T00:00:00+00:00")
        except (KeyError, ValueError):
            continue
        uid = f"google:{it['id']}"
        ev = db.scalar(select(CalendarEvent).where(CalendarEvent.user_id == user.id, CalendarEvent.external_uid == uid))
        vals = dict(title=(it.get("summary") or "Без названия")[:200], description=it.get("description") or "",
                    location=(it.get("location") or "")[:200], starts_at=starts, ends_at=ends, all_day=all_day,
                    timezone=s.get("timeZone") or user.profile.timezone, external_source="google", external_uid=uid)
        if ev:
            for k, v in vals.items():
                setattr(ev, k, v)
            updated += 1
        else:
            db.add(CalendarEvent(user_id=user.id, **vals))
            created += 1
    acc.last_sync_at = now
    db.commit()
    return {"created": created, "updated": updated}


@router.delete("/google", status_code=204)
def disconnect(db: DB, user: CurrentUser):
    acc = db.scalar(select(ConnectedAccount).where(ConnectedAccount.user_id == user.id,
                                                   ConnectedAccount.provider == "google"))
    if acc:
        db.delete(acc)
        db.commit()
    return Response(status_code=204)
