import os

os.environ["ENVIRONMENT"] = "test"
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://lifeos:lifeos@localhost:5432/lifeos_test")
os.environ["SMTP_HOST"] = ""
for _k in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"):  # never hit real AI providers in tests
    os.environ[_k] = ""
os.environ["UPLOAD_DIR"] = "/tmp/lifeos-test-uploads"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services.gamification import seed_achievements  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def clean_db():
    names = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as c:
        c.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
    with SessionLocal() as db:
        seed_achievements(db)
    yield


def make_client(email="user@example.com", name="Тест", tz="Asia/Almaty") -> TestClient:
    c = TestClient(app)
    r = c.post("/api/v1/auth/register", json={"email": email, "password": "secret123", "name": name, "timezone": tz})
    assert r.status_code == 201, r.text
    c.headers["x-csrf-token"] = c.cookies.get("lifeos_csrf")
    return c


@pytest.fixture
def client():
    return make_client()


@pytest.fixture
def other():
    return make_client("other@example.com", "Другой")
