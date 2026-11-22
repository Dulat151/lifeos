"""Private file storage. Files are stored under UPLOAD_DIR with random keys, never served statically;
download requires authentication and ownership."""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import DB, CurrentUser, get_owned
from app.models import Attachment

router = APIRouter(prefix="/files", tags=["files"])

ALLOWED = {
    "image/png": b"\x89PNG", "image/jpeg": b"\xff\xd8\xff", "image/gif": b"GIF8", "image/webp": b"RIFF",
    "application/pdf": b"%PDF",
    "text/plain": None, "text/markdown": None, "text/csv": None,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": b"PK",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": b"PK",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": b"PK",
}
ENTITY_TYPES = {"goal", "task", "note", "course", "lesson", "book", "journal", "vision_board", "flashcard"}


def _root() -> Path:
    p = Path(settings.upload_dir).resolve()
    p.mkdir(parents=True, exist_ok=True)
    return p


def _safe_name(name: str) -> str:
    base = os.path.basename(name or "file").replace("\x00", "")
    return "".join(c for c in base if c.isprintable() and c not in '<>:"/\\|?*')[:200] or "file"


@router.post("", status_code=201)
async def upload(db: DB, user: CurrentUser, file: UploadFile = File(...), entity_type: str | None = Form(None),
                 entity_id: uuid.UUID | None = Form(None)):
    ctype = (file.content_type or "").split(";")[0].strip().lower()
    if ctype not in ALLOWED:
        raise HTTPException(415, f"Тип файла не поддерживается: {ctype or 'unknown'}")
    if entity_type and entity_type not in ENTITY_TYPES:
        raise HTTPException(422, "Неизвестный тип объекта")
    limit = settings.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"Файл больше {settings.max_upload_mb} МБ")
    if not data:
        raise HTTPException(422, "Пустой файл")
    magic = ALLOWED[ctype]
    if magic and not data.startswith(magic):
        raise HTTPException(415, "Содержимое файла не соответствует типу")
    if ctype.startswith("text/") and b"\x00" in data[:4096]:
        raise HTTPException(415, "Бинарные данные в текстовом файле")
    key = f"{user.id}/{uuid.uuid4().hex}"
    path = _root() / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    a = Attachment(user_id=user.id, filename=_safe_name(file.filename), content_type=ctype, size=len(data),
                   storage_key=key, entity_type=entity_type, entity_id=entity_id)
    db.add(a)
    db.commit()
    return _meta(a)


def _meta(a: Attachment) -> dict:
    return {"id": str(a.id), "filename": a.filename, "content_type": a.content_type, "size": a.size,
            "entity_type": a.entity_type, "entity_id": str(a.entity_id) if a.entity_id else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "url": f"/api/v1/files/{a.id}/download"}


@router.get("")
def list_files(db: DB, user: CurrentUser, entity_type: str | None = None, entity_id: uuid.UUID | None = None):
    stmt = select(Attachment).where(Attachment.user_id == user.id)
    if entity_type:
        stmt = stmt.where(Attachment.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(Attachment.entity_id == entity_id)
    return [_meta(a) for a in db.scalars(stmt.order_by(Attachment.created_at.desc()))]


@router.get("/{fid}/download")
def download(fid: uuid.UUID, db: DB, user: CurrentUser, inline: bool = False):
    a = get_owned(db, Attachment, fid, user)
    path = (_root() / a.storage_key).resolve()
    if not str(path).startswith(str(_root())) or not path.exists():
        raise HTTPException(404, "Файл не найден")
    disp = "inline" if inline and a.content_type in ("application/pdf", "image/png", "image/jpeg", "image/gif",
                                                     "image/webp") else "attachment"
    return FileResponse(path, media_type=a.content_type, filename=a.filename, content_disposition_type=disp,
                        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"})


@router.delete("/{fid}", status_code=204)
def delete_file(fid: uuid.UUID, db: DB, user: CurrentUser):
    a = get_owned(db, Attachment, fid, user)
    p = _root() / a.storage_key
    db.delete(a)
    db.commit()
    p.unlink(missing_ok=True)
    return Response(status_code=204)


def delete_user_files(db, user) -> None:
    for a in db.scalars(select(Attachment).where(Attachment.user_id == user.id)):
        (_root() / a.storage_key).unlink(missing_ok=True)
