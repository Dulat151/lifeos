"""/users (me, account deletion), /profiles, /settings, /exports."""
import json
from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.core.security import verify_password
from app.core.db import Base
from app.schemas import MeRead, ProfileRead, ProfileUpdate, SettingsRead, SettingsUpdate

router = APIRouter(tags=["users"])


def me_payload(user) -> MeRead:
    return MeRead(id=user.id, email=user.email, email_verified=bool(user.email_verified_at),
                  created_at=user.created_at, profile=ProfileRead.model_validate(user.profile),
                  settings=SettingsRead.model_validate(user.settings))


@router.get("/users/me", response_model=MeRead)
def me(user: CurrentUser):
    return me_payload(user)


@router.get("/profiles/me", response_model=ProfileRead)
def get_profile(user: CurrentUser):
    return ProfileRead.model_validate(user.profile)


@router.patch("/profiles/me", response_model=ProfileRead)
def update_profile(payload: ProfileUpdate, user: CurrentUser, db: DB):
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is None and k in ("name", "timezone", "language", "bio", "is_public"):
            raise HTTPException(422, f"Поле {k} не может быть пустым")
        setattr(user.profile, k, v)
    db.commit()
    return ProfileRead.model_validate(user.profile)


@router.get("/settings", response_model=SettingsRead)
def get_settings(user: CurrentUser):
    return SettingsRead.model_validate(user.settings)


@router.patch("/settings", response_model=SettingsRead)
def update_settings(payload: SettingsUpdate, user: CurrentUser, db: DB):
    data = payload.model_dump(exclude_unset=True)
    if "preferences" in data and data["preferences"] is not None:
        allowed = {"calendar_view": ("month", "week", "day", "agenda"), "xp_animations": (True, False),
                   "show_quests": (True, False), "default_note_template": None, "start_page": None}
        prefs = dict(user.settings.preferences or {})
        for k, v in data["preferences"].items():
            if k not in allowed or (allowed[k] and v not in allowed[k]) or (isinstance(v, str) and len(v) > 60):
                raise HTTPException(422, f"Недопустимая настройка: {k}")
            prefs[k] = v
        data["preferences"] = prefs
    nullable = {"quiet_hours_start", "quiet_hours_end"}
    for k, v in data.items():
        if v is None and k not in nullable:
            raise HTTPException(422, f"Поле {k} не может быть пустым")
        setattr(user.settings, k, v)
    db.commit()
    return SettingsRead.model_validate(user.settings)


class DeleteAccountIn(BaseModel):
    password: str
    confirm: str  # must equal "DELETE"


@router.post("/users/me/delete", status_code=204)
def delete_account(payload: DeleteAccountIn, user: CurrentUser, db: DB):
    """Irreversible. Requires password and the confirmation word. All owned rows cascade (ON DELETE CASCADE)."""
    if payload.confirm != "DELETE":
        raise HTTPException(400, "Введите DELETE для подтверждения")
    if not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(400, "Неверный пароль")
    from app.api.v1.files import delete_user_files

    delete_user_files(db, user)
    db.delete(user)
    db.commit()
    resp = Response(status_code=204)
    from app.api.v1.auth import _clear_cookies

    _clear_cookies(resp)
    return resp


def _ser(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    if hasattr(v, "hex") and not isinstance(v, (bytes, str)):
        return str(v)
    return v


EXCLUDE_TABLES = {"users", "sessions", "one_time_tokens", "push_subscriptions", "achievements"}
EXCLUDE_COLS = {"password_hash", "refresh_token_hash", "token_hash"}


@router.get("/exports/full", summary="Export all user data as JSON")
def export_all(user: CurrentUser, db: DB):
    out: dict = {"exported_at": datetime.now(UTC).isoformat(), "user": {"id": str(user.id), "email": user.email}}
    for table in Base.metadata.sorted_tables:
        if table.name in EXCLUDE_TABLES or "user_id" not in table.c:
            continue
        rows = db.execute(select(table).where(table.c.user_id == user.id)).mappings().all()
        out[table.name] = [{k: _ser(v) for k, v in r.items() if k not in EXCLUDE_COLS} for r in rows]
    data = json.dumps(out, ensure_ascii=False, indent=2)
    fname = f"lifeos-export-{date.today().isoformat()}.json"
    return StreamingResponse(iter([data]), media_type="application/json",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})
