import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update

from app.core.config import settings
from app.core.deps import ACCESS_COOKIE, CSRF_COOKIE, DB, REFRESH_COOKIE, CurrentUser
from app.core.ratelimit import rate_limit
from app.core.security import (create_access_token, hash_password, hash_token, new_opaque_token,
                               verify_password)
from app.models import AuthSession, OneTimeToken, Profile, User, UserSettings
from app.schemas import (ChangePasswordIn, EmailIn, LoginIn, RegisterIn, ResetIn, SessionRead, TokenIn)
from app.services.email import try_send

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Depends(rate_limit("auth", settings.rate_limit_auth))

DEFAULT_LAYOUT = {
    "widgets": [
        {"id": "today_tasks", "visible": True}, {"id": "priorities", "visible": True},
        {"id": "habits", "visible": True}, {"id": "events", "visible": True},
        {"id": "goals", "visible": True}, {"id": "learning", "visible": True},
        {"id": "focus", "visible": True}, {"id": "stats", "visible": True},
        {"id": "weekly", "visible": True}, {"id": "quote", "visible": True},
        {"id": "ai", "visible": True},
    ]
}


def _set_auth_cookies(resp: Response, access: str, refresh: str) -> None:
    common = {"secure": settings.cookie_secure, "samesite": "lax", "domain": settings.cookie_domain}
    resp.set_cookie(ACCESS_COOKIE, access, httponly=True, max_age=settings.access_token_minutes * 60, path="/",
                    **common)
    resp.set_cookie(REFRESH_COOKIE, refresh, httponly=True, max_age=settings.refresh_token_days * 86400,
                    path="/api/v1/auth", **common)
    resp.set_cookie(CSRF_COOKIE, secrets.token_urlsafe(24), httponly=False,
                    max_age=settings.refresh_token_days * 86400, path="/", **common)


def _clear_cookies(resp: Response) -> None:
    for name, path in ((ACCESS_COOKIE, "/"), (REFRESH_COOKIE, "/api/v1/auth"), (CSRF_COOKIE, "/")):
        resp.delete_cookie(name, path=path, domain=settings.cookie_domain)


def _start_session(db, user: User, request: Request, resp: Response) -> dict:
    refresh = new_opaque_token()
    sess = AuthSession(user_id=user.id, refresh_token_hash=hash_token(refresh),
                       user_agent=(request.headers.get("user-agent") or "")[:300],
                       ip=request.client.host if request.client else "",
                       expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
                       last_used_at=datetime.now(UTC))
    db.add(sess)
    db.flush()
    access = create_access_token(user.id, sess.id)
    db.commit()
    _set_auth_cookies(resp, access, refresh)
    return {"access_token": access, "token_type": "bearer", "expires_in": settings.access_token_minutes * 60}


def _issue_token(db, user: User, purpose: str, hours: int) -> str:
    raw = new_opaque_token()
    db.add(OneTimeToken(user_id=user.id, purpose=purpose, token_hash=hash_token(raw),
                        expires_at=datetime.now(UTC) + timedelta(hours=hours)))
    return raw


def _consume_token(db, raw: str, purpose: str) -> User:
    tok = db.scalar(select(OneTimeToken).where(OneTimeToken.token_hash == hash_token(raw),
                                               OneTimeToken.purpose == purpose))
    if not tok or tok.used_at or tok.expires_at < datetime.now(UTC):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ссылка недействительна или устарела")
    tok.used_at = datetime.now(UTC)
    return db.get(User, tok.user_id)


@router.post("/register", status_code=201, dependencies=[limiter])
def register(payload: RegisterIn, request: Request, response: Response, db: DB):
    if db.scalar(select(User.id).where(User.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Пользователь с таким email уже существует")
    user = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()
    db.add(Profile(user_id=user.id, name=payload.name, timezone=payload.timezone, language=payload.language))
    db.add(UserSettings(user_id=user.id, dashboard_layout=DEFAULT_LAYOUT,
                        notification_prefs={"in_app": True, "browser": True, "web_push": True, "email": True},
                        ai_context={"goals": True, "tasks": True, "habits": True, "calendar": True,
                                    "learning": True, "journal": False, "finance": False, "health": False}))
    raw = _issue_token(db, user, "verify_email", 48)
    db.flush()
    sent = try_send(user.email, "LIFE OS — подтверждение email",
                    f"Подтвердите email: {settings.frontend_url}/verify-email?token={raw}")
    result = _start_session(db, user, request, response)
    return {**result, "verification_email_sent": sent}


@router.post("/login", dependencies=[limiter])
def login(payload: LoginIn, request: Request, response: Response, db: DB):
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный email или пароль")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Аккаунт отключён")
    return _start_session(db, user, request, response)


@router.post("/refresh", dependencies=[limiter])
def refresh(request: Request, response: Response, db: DB):
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Нет refresh-токена")
    sess = db.scalar(select(AuthSession).where(AuthSession.refresh_token_hash == hash_token(raw)))
    if not sess or sess.revoked_at or sess.expires_at < datetime.now(UTC):
        _clear_cookies(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Сессия истекла")
    # Rotate refresh token
    new_raw = new_opaque_token()
    sess.refresh_token_hash = hash_token(new_raw)
    sess.last_used_at = datetime.now(UTC)
    access = create_access_token(sess.user_id, sess.id)
    db.commit()
    _set_auth_cookies(response, access, new_raw)
    return {"access_token": access, "token_type": "bearer", "expires_in": settings.access_token_minutes * 60}


@router.post("/logout", status_code=204)
def logout(request: Request, user: CurrentUser, db: DB):
    sess = db.get(AuthSession, request.state.session_id)
    if sess:
        sess.revoked_at = datetime.now(UTC)
    db.commit()
    resp = Response(status_code=204)
    _clear_cookies(resp)
    return resp


@router.post("/verify-email", dependencies=[limiter])
def verify_email(payload: TokenIn, db: DB):
    user = _consume_token(db, payload.token, "verify_email")
    user.email_verified_at = datetime.now(UTC)
    db.commit()
    return {"verified": True}


@router.post("/resend-verification", dependencies=[limiter])
def resend_verification(user: CurrentUser, db: DB):
    if user.email_verified_at:
        return {"sent": False, "already_verified": True}
    raw = _issue_token(db, user, "verify_email", 48)
    db.commit()
    sent = try_send(user.email, "LIFE OS — подтверждение email",
                    f"Подтвердите email: {settings.frontend_url}/verify-email?token={raw}")
    return {"sent": sent, "email_configured": bool(settings.smtp_host)}


@router.post("/password-reset/request", dependencies=[limiter])
def password_reset_request(payload: EmailIn, db: DB):
    user = db.scalar(select(User).where(User.email == payload.email.strip().lower()))
    if user:
        raw = _issue_token(db, user, "reset_password", 2)
        db.commit()
        try_send(user.email, "LIFE OS — сброс пароля",
                 f"Сбросить пароль: {settings.frontend_url}/reset-password?token={raw}\nСсылка действует 2 часа.")
    # Same response whether user exists or not (no account enumeration)
    return {"ok": True, "email_configured": bool(settings.smtp_host)}


@router.post("/password-reset/confirm", dependencies=[limiter])
def password_reset_confirm(payload: ResetIn, db: DB):
    user = _consume_token(db, payload.token, "reset_password")
    user.password_hash = hash_password(payload.password)
    db.execute(update(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
               .values(revoked_at=datetime.now(UTC)))
    db.commit()
    return {"ok": True}


@router.post("/change-password")
def change_password(payload: ChangePasswordIn, request: Request, user: CurrentUser, db: DB):
    if not user.password_hash or not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Текущий пароль неверен")
    user.password_hash = hash_password(payload.new_password)
    db.execute(update(AuthSession).where(AuthSession.user_id == user.id, AuthSession.id != request.state.session_id,
                                         AuthSession.revoked_at.is_(None)).values(revoked_at=datetime.now(UTC)))
    db.commit()
    return {"ok": True}


@router.get("/sessions", response_model=list[SessionRead])
def list_sessions(request: Request, user: CurrentUser, db: DB):
    rows = db.scalars(select(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None),
                                                AuthSession.expires_at > datetime.now(UTC))
                      .order_by(AuthSession.created_at.desc())).all()
    out = []
    for s in rows:
        item = SessionRead.model_validate(s)
        item.current = s.id == request.state.session_id
        out.append(item)
    return out


@router.delete("/sessions/{session_id}", status_code=204)
def revoke_session(session_id: uuid.UUID, user: CurrentUser, db: DB):
    s = db.scalar(select(AuthSession).where(AuthSession.id == session_id, AuthSession.user_id == user.id))
    if not s:
        raise HTTPException(404, "Сессия не найдена")
    s.revoked_at = datetime.now(UTC)
    db.commit()
    return Response(status_code=204)


@router.get("/google/status")
def google_status():
    return {"configured": bool(settings.google_client_id and settings.google_client_secret)}
