"""Generic owned-resource CRUD router factory.

All business modules with plain CRUD semantics use this single implementation, so
ownership checks, soft delete, pagination, search and validation live in one place.
"""
import uuid
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select

from app.core.deps import DB, CurrentUser, ensure_refs_owned, get_owned
from app.core.time import utcnow


class Page(BaseModel):
    items: list[Any]
    total: int
    limit: int
    offset: int


def crud_router(
    *,
    model,
    create_schema: type[BaseModel],
    update_schema: type[BaseModel],
    read_schema: type[BaseModel],
    tags: list[str],
    search_fields: tuple[str, ...] = (),
    filter_fields: tuple[str, ...] = (),
    order_by: tuple = (),
    ref_models: dict[str, Any] | None = None,
    parent_field: str | None = None,
    parent_model=None,
    after_create: Callable | None = None,
    after_update: Callable | None = None,
    before_delete: Callable | None = None,
    router: APIRouter | None = None,
    path: str = "",
    skip: tuple[str, ...] = (),
) -> APIRouter:
    r = router or APIRouter(tags=tags)

    def route(kind: str, method: str, p: str, **kw):
        if kind in skip:
            return lambda f: f
        return getattr(r, method)(p, **kw)
    ref_models = ref_models or {}
    if parent_field and parent_model:
        ref_models = {**ref_models, parent_field: parent_model}
    soft = hasattr(model, "deleted_at")

    def _check_refs(db, user, data: dict):
        ensure_refs_owned(db, user, {ref_models[k]: v for k, v in data.items() if k in ref_models})

    @route("list", "get", f"{path}", response_model=Page, summary=f"List {model.__tablename__}")
    def list_items(
        db: DB,
        user: CurrentUser,
        q: str | None = Query(None, max_length=200),
        limit: int = Query(100, ge=1, le=500),
        offset: int = Query(0, ge=0),
        include_archived: bool = False,
        filters: str | None = Query(None, description="field:value,field:value"),
    ):
        stmt = select(model).where(model.user_id == user.id)
        if soft:
            stmt = stmt.where(model.deleted_at.is_(None))
        if hasattr(model, "archived") and not include_archived:
            stmt = stmt.where(model.archived.is_(False))
        if q and search_fields:
            like = f"%{q}%"
            stmt = stmt.where(or_(*[getattr(model, f).ilike(like) for f in search_fields]))
        if filters:
            for pair in filters.split(","):
                if ":" not in pair:
                    continue
                k, v = pair.split(":", 1)
                if k in filter_fields or k == parent_field:
                    col = getattr(model, k)
                    if v == "null":
                        stmt = stmt.where(col.is_(None))
                    else:
                        try:
                            pyv = col.type.python_type
                            val = uuid.UUID(v) if pyv is uuid.UUID else (v.lower() == "true" if pyv is bool else pyv(v))
                        except (ValueError, NotImplementedError):
                            raise HTTPException(422, f"Некорректный фильтр {k}") from None
                        stmt = stmt.where(col == val)
        total = db.scalar(select(func.count()).select_from(stmt.subquery()))
        stmt = stmt.order_by(*(order_by or (model.created_at.desc(),))).limit(limit).offset(offset)
        items = [read_schema.model_validate(o) for o in db.scalars(stmt)]
        return Page(items=items, total=total or 0, limit=limit, offset=offset)

    @route("create", "post", f"{path}", response_model=read_schema, status_code=status.HTTP_201_CREATED)
    def create_item(payload: create_schema, db: DB, user: CurrentUser):  # type: ignore[valid-type]
        data = payload.model_dump()
        _check_refs(db, user, data)
        obj = model(**data, user_id=user.id)
        db.add(obj)
        db.flush()
        if after_create:
            after_create(db, user, obj)
        db.commit()
        db.refresh(obj)
        return read_schema.model_validate(obj)

    @route("get", "get", f"{path}/{{item_id}}", response_model=read_schema)
    def get_item(item_id: uuid.UUID, db: DB, user: CurrentUser):
        return read_schema.model_validate(get_owned(db, model, item_id, user))

    @route("update", "patch", f"{path}/{{item_id}}", response_model=read_schema)
    def update_item(item_id: uuid.UUID, payload: update_schema, db: DB, user: CurrentUser):  # type: ignore
        obj = get_owned(db, model, item_id, user)
        data = payload.model_dump(exclude_unset=True)
        _check_refs(db, user, data)
        before = {k: getattr(obj, k) for k in data}
        for k, v in data.items():
            setattr(obj, k, v)
        db.flush()
        if after_update:
            after_update(db, user, obj, before)
        db.commit()
        db.refresh(obj)
        return read_schema.model_validate(obj)

    @route("delete", "delete", f"{path}/{{item_id}}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_item(item_id: uuid.UUID, db: DB, user: CurrentUser):
        obj = get_owned(db, model, item_id, user)
        if before_delete:
            before_delete(db, user, obj)
        if soft:
            obj.deleted_at = utcnow()
        else:
            db.delete(obj)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return r
