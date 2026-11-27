import logging
from contextlib import asynccontextmanager
import time
import uuid

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.api.v1 import (ai, projects, rewards, analytics, auth, calendar, files, goals, habits, integrations, learning, life, personal,
                        reminders, tasks, users)
from app.core.config import settings
from app.core.db import SessionLocal, engine

logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("lifeos")

@asynccontextmanager
async def lifespan(_app):
    seed()
    yield


app = FastAPI(lifespan=lifespan, title="LIFE OS API", version="1.0.0", description="Personal Development Operating System",
              docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)

app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def security_and_logging(request: Request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.url.path.startswith("/api/v1"):
        response.headers.setdefault("Cache-Control", "no-store")
    log.info("%s %s %s %.0fms rid=%s", request.method, request.url.path, response.status_code,
             (time.perf_counter() - start) * 1000, rid)
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = [{"field": ".".join(str(x) for x in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": "Ошибка валидации", "errors": errors})


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(IntegrityError)
async def integrity_handler(request: Request, exc: IntegrityError):
    log.warning("IntegrityError: %s", exc.orig)
    return JSONResponse(status_code=409, content={"detail": "Конфликт данных (дубликат или нарушение связи)"})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Внутренняя ошибка сервера"})


api = APIRouter(prefix="/api/v1")
for r in (auth.router, users.router, goals.router, tasks.router, habits.router, calendar.router, reminders.router,
          learning.learning, learning.flashcards, learning.books, life.health, life.finance, life.journal,
          life.notes, life.folders, life.focus, analytics.analytics, analytics.dashboard, analytics.gamification,
          personal.personal, personal.challenges, personal.social, ai.router, files.router, integrations.router, projects.router,
          rewards.router):
    api.include_router(r)
app.include_router(api)


@app.get("/api/health", tags=["system"])
def health():
    with engine.connect() as c:
        c.execute(text("select 1"))
    return {"status": "ok", "version": app.version}


def seed():
    try:
        from app.services.gamification import seed_achievements

        with SessionLocal() as db:
            seed_achievements(db)
    except Exception:  # noqa: BLE001 - DB might not be migrated yet
        log.warning("Achievement seeding skipped (run migrations first)")
