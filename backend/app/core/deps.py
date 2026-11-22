import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models import AuthSession, User

ACCESS_COOKIE = "lifeos_access"
REFRESH_COOKIE = "lifeos_refresh"
CSRF_COOKIE = "lifeos_csrf"
CSRF_HEADER = "x-csrf-token"
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}

DB = Annotated[Session, Depends(get_db)]


def _unauthorized(msg: str = "Требуется авторизация") -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, msg, headers={"WWW-Authenticate": "Bearer"})


def get_current_user(request: Request, db: DB) -> User:
    token = None
    via_cookie = False
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:]
    elif request.cookies.get(ACCESS_COOKIE):
        token = request.cookies[ACCESS_COOKIE]
        via_cookie = True
    if not token:
        raise _unauthorized()
    payload = decode_access_token(token)
    if not payload:
        raise _unauthorized("Сессия истекла")

    # CSRF: double-submit cookie for cookie-authenticated state-changing requests
    if via_cookie and request.method in UNSAFE:
        header = request.headers.get(CSRF_HEADER)
        cookie = request.cookies.get(CSRF_COOKIE)
        if not header or not cookie or header != cookie:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "CSRF-проверка не пройдена")

    sess = db.get(AuthSession, uuid.UUID(payload["sid"]))
    if not sess or sess.revoked_at or sess.expires_at < datetime.now(UTC):
        raise _unauthorized("Сессия отозвана")
    user = db.get(User, uuid.UUID(payload["sub"]))
    if not user or not user.is_active:
        raise _unauthorized()
    request.state.session_id = sess.id
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_owned(db: Session, model, obj_id: uuid.UUID, user: User, *, include_deleted: bool = False):
    """Fetch a row by id that belongs to the user. Returns 404 (not 403) so IDs of other accounts are not leaked."""
    stmt = select(model).where(model.id == obj_id, model.user_id == user.id)
    if hasattr(model, "deleted_at") and not include_deleted:
        stmt = stmt.where(model.deleted_at.is_(None))
    obj = db.scalar(stmt)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Объект не найден")
    return obj


def ensure_refs_owned(db: Session, user: User, refs: dict) -> None:
    """refs = {model: id_or_None}. Rejects references to other users' objects."""
    for model, obj_id in refs.items():
        if obj_id is not None:
            try:
                get_owned(db, model, obj_id, user)
            except HTTPException:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY, f"Связанный объект {model.__tablename__} не найден"
                ) from None
