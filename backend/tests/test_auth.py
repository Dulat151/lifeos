from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import hash_token
from app.main import app
from app.models import OneTimeToken, User
from tests.conftest import make_client


def test_register_and_me(client):
    r = client.get("/api/v1/users/me")
    assert r.status_code == 200
    me = r.json()
    assert me["email"] == "user@example.com"
    assert me["profile"]["timezone"] == "Asia/Almaty"
    assert me["profile"]["language"] == "ru"
    assert me["email_verified"] is False


def test_register_duplicate_and_validation():
    make_client()
    c = TestClient(app)
    r = c.post("/api/v1/auth/register", json={"email": "USER@example.com", "password": "secret123", "name": "x"})
    assert r.status_code == 409
    r = c.post("/api/v1/auth/register", json={"email": "bad", "password": "secret123", "name": "x"})
    assert r.status_code == 422
    r = c.post("/api/v1/auth/register", json={"email": "a@b.co", "password": "onlyletters", "name": "x"})
    assert r.status_code == 422


def test_login_logout_flow():
    make_client()
    c = TestClient(app)
    assert c.post("/api/v1/auth/login", json={"email": "user@example.com", "password": "wrong123"}).status_code == 401
    r = c.post("/api/v1/auth/login", json={"email": "user@example.com", "password": "secret123"})
    assert r.status_code == 200
    assert c.get("/api/v1/users/me").status_code == 200
    # unsafe request without CSRF header is rejected when authenticated by cookie
    assert c.post("/api/v1/auth/logout").status_code == 403
    c.headers["x-csrf-token"] = c.cookies.get("lifeos_csrf")
    assert c.post("/api/v1/auth/logout").status_code == 204
    assert c.get("/api/v1/users/me").status_code == 401


def test_bearer_token_and_revoked_session():
    c = TestClient(app)
    r = c.post("/api/v1/auth/register", json={"email": "b@b.co", "password": "secret123", "name": "B"})
    token = r.json()["access_token"]
    bare = TestClient(app)
    h = {"Authorization": f"Bearer {token}"}
    assert bare.get("/api/v1/users/me", headers=h).status_code == 200
    sessions = bare.get("/api/v1/auth/sessions", headers=h).json()
    assert len(sessions) == 1 and sessions[0]["current"]
    assert bare.delete(f"/api/v1/auth/sessions/{sessions[0]['id']}", headers=h).status_code == 204
    assert bare.get("/api/v1/users/me", headers=h).status_code == 401


def test_refresh_rotates_token(client):
    old = client.cookies.get("lifeos_refresh")
    r = client.post("/api/v1/auth/refresh")
    assert r.status_code == 200
    assert client.cookies.get("lifeos_refresh") != old


def _token_for(email, purpose):
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == email))
        raw = "test-token-" + purpose + "-" + "x" * 20
        db.add(OneTimeToken(user_id=u.id, purpose=purpose, token_hash=hash_token(raw),
                            expires_at=datetime.now(UTC) + timedelta(hours=1)))
        db.commit()
        return raw


def test_email_verification(client):
    raw = _token_for("user@example.com", "verify_email")
    assert client.post("/api/v1/auth/verify-email", json={"token": raw}).status_code == 200
    assert client.get("/api/v1/users/me").json()["email_verified"] is True
    assert client.post("/api/v1/auth/verify-email", json={"token": raw}).status_code == 400  # single use


def test_password_reset_revokes_sessions(client):
    c = TestClient(app)
    r = c.post("/api/v1/auth/password-reset/request", json={"email": "nobody@example.com"})
    assert r.status_code == 200 and r.json()["ok"]  # no enumeration
    raw = _token_for("user@example.com", "reset_password")
    assert c.post("/api/v1/auth/password-reset/confirm", json={"token": raw, "password": "newpass123"}).status_code == 200
    assert client.get("/api/v1/users/me").status_code == 401  # old session revoked
    assert c.post("/api/v1/auth/login", json={"email": "user@example.com", "password": "newpass123"}).status_code == 200


def test_settings_and_profile_persist(client):
    r = client.patch("/api/v1/settings", json={"theme": "light", "currency": "USD", "quiet_hours_start": "22:00",
                                               "quiet_hours_end": "07:00"})
    assert r.status_code == 200
    assert client.get("/api/v1/settings").json()["currency"] == "USD"
    assert client.patch("/api/v1/settings", json={"currency": "usd"}).status_code == 422
    assert client.patch("/api/v1/profiles/me", json={"timezone": "Mars/Base"}).status_code == 422
    r = client.patch("/api/v1/profiles/me", json={"language": "kk", "bio": "hi"})
    assert r.json()["language"] == "kk"


def test_rate_limit_function():
    from fastapi import HTTPException

    from app.core.ratelimit import check_limit

    import pytest

    import uuid

    key = f"test:rl-unit:{uuid.uuid4()}"
    for _ in range(3):
        check_limit(key, 3)
    with pytest.raises(HTTPException) as e:
        check_limit(key, 3)
    assert e.value.status_code == 429
