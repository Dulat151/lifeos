# DEVELOPMENT.md

## Prerequisites
PostgreSQL 16, Redis 7 (optional locally — rate limiting falls back to memory), Python 3.12+, Node 22.

## Environment variables
See `.env.example` (all variables documented inline). The backend reads `backend/.env` or the process environment.
Minimal local set: `DATABASE_URL`, `SECRET_KEY`. Frontend: `BACKEND_URL` (where Next proxies `/api/*`, default `http://localhost:8000`).

## Run
```bash
make dev-api         # alembic upgrade + uvicorn --reload on :8000
make dev-scheduler   # reminder engine loop (or: celery -A app.workers.celery_app worker + beat)
make dev-web         # next dev on :3000
```

## Adding a module
1. **Model** in `backend/app/models/<domain>.py` (inherit `UUIDPk, Timestamps, Owned`, add `SoftDelete` if needed). Export it from `models/__init__.py`.
2. **Migration**: `alembic revision --autogenerate -m "add X"`, review the file, `alembic upgrade head`, `alembic check`.
3. **Schemas**: `XCreate` with validation; `XUpdate = make_update(XCreate, "XUpdate")`; `XRead(Read, XCreate)`.
4. **API**: for plain CRUD call `crud_router(model=..., create_schema=..., ref_models={"goal_id": Goal}, ...)` — ownership,
   pagination, search, soft delete and FK checks come for free. Register custom routes *before* calling `crud_router`
   on the same router so static paths win over `/{item_id}`. Include the router in `app/main.py`.
5. **Tests** in `backend/tests/` — at least one happy path and one cross-user isolation assertion.
6. **Frontend**: types in `lib/types.ts`, page in `app/(app)/<route>/page.tsx` using `useGet`/`useMut` and `EntityList`/`EntityDialog`
   for simple resources. Add the route to `components/layout/nav.ts` and labels to `lib/i18n.ts` (ru required; kk/en fall back to ru).
   Page files may only export the default component — shared configs go to `lib/fields.ts` / hooks.

## Code quality
```bash
cd backend && ruff check app tests --select F,E9 && pytest -q
cd frontend && npm run lint && npm test && npm run build
```
