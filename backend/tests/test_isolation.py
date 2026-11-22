"""Cross-account access: every owned resource must be invisible and immutable for another user (ID substitution)."""
from datetime import UTC, date, datetime, timedelta


def test_cross_user_isolation(client, other):
    now = datetime.now(UTC)
    g = client.post("/api/v1/goals", json={"title": "мой"}).json()
    m = client.post(f"/api/v1/goals/{g['id']}/milestones", json={"title": "этап"}).json()
    t = client.post("/api/v1/tasks", json={"title": "мой"}).json()
    h = client.post("/api/v1/habits", json={"title": "мой"}).json()
    e = client.post("/api/v1/calendar/events", json={"title": "мой", "starts_at": now.isoformat(),
                                                     "ends_at": (now + timedelta(hours=1)).isoformat()}).json()
    n = client.post("/api/v1/notes", json={"title": "мой"}).json()
    j = client.post("/api/v1/journal/entries", json={"entry_date": date.today().isoformat(), "body": "x"}).json()
    b = client.post("/api/v1/books", json={"title": "мой"}).json()
    d = client.post("/api/v1/flashcards/decks", json={"title": "мой"}).json()
    tx = client.post("/api/v1/finance/transactions", json={"kind": "expense", "amount": "1",
                                                           "occurred_on": date.today().isoformat()}).json()
    f = client.post("/api/v1/files", files={"file": ("a.txt", b"hello", "text/plain")}).json()

    for url in [f"/api/v1/goals/{g['id']}", f"/api/v1/tasks/{t['id']}", f"/api/v1/habits/{h['id']}",
                f"/api/v1/calendar/events/{e['id']}", f"/api/v1/notes/{n['id']}", f"/api/v1/journal/entries/{j['id']}",
                f"/api/v1/books/{b['id']}", f"/api/v1/finance/transactions/{tx['id']}",
                f"/api/v1/files/{f['id']}/download", f"/api/v1/habits/{h['id']}/stats"]:
        assert other.get(url).status_code == 404, url

    assert other.patch(f"/api/v1/tasks/{t['id']}", json={"title": "hack"}).status_code == 404
    assert other.delete(f"/api/v1/goals/{g['id']}").status_code == 404
    assert other.post(f"/api/v1/habits/{h['id']}/check", json={}).status_code == 404
    assert other.post(f"/api/v1/goals/{g['id']}/milestones/{m['id']}/toggle").status_code == 404
    assert other.post("/api/v1/flashcards/cards", json={"deck_id": d["id"], "front": "a", "back": "b"}).status_code == 422
    # linking own task to someone else's goal is rejected
    assert other.post("/api/v1/tasks", json={"title": "x", "goal_id": g["id"]}).status_code == 422
    assert other.post("/api/v1/tasks", json={"title": "x", "milestone_id": m["id"]}).status_code == 422
    # lists never include foreign data
    assert other.get("/api/v1/tasks").json()["total"] == 0
    assert other.get("/api/v1/goals").json() == []
    assert other.get("/api/v1/notes").json()["total"] == 0
    assert other.get("/api/v1/dashboard/search?q=мой").json() == []
    assert "мой" not in other.get("/api/v1/exports/full").text
    # owner still sees everything intact
    assert client.get(f"/api/v1/tasks/{t['id']}").json()["title"] == "мой"


def test_unauthenticated_rejected():
    from fastapi.testclient import TestClient

    from app.main import app

    c = TestClient(app)
    for url in ["/api/v1/tasks", "/api/v1/goals", "/api/v1/dashboard", "/api/v1/exports/full", "/api/v1/ai/status"]:
        assert c.get(url).status_code == 401, url


def test_social_privacy(client, other):
    assert client.get("/api/v1/social/friends").status_code == 403  # disabled by default
    client.patch("/api/v1/settings", json={"social_enabled": True})
    other.patch("/api/v1/settings", json={"social_enabled": True})
    client.post("/api/v1/social/friends/request", json={"email": "other@example.com"})
    fr = other.get("/api/v1/social/friends").json()
    assert fr[0]["direction"] == "incoming"
    other_id = other.get("/api/v1/users/me").json()["id"]
    me_id = client.get("/api/v1/users/me").json()["id"]
    assert client.get(f"/api/v1/social/users/{other_id}/profile").status_code == 404  # not friends, not public
    other.post(f"/api/v1/social/friends/{fr[0]['id']}/accept")
    assert client.get(f"/api/v1/social/users/{other_id}/profile").status_code == 200
    g = client.post("/api/v1/goals", json={"title": "общая"}).json()
    client.post(f"/api/v1/social/goals/{g['id']}/share", json={"user_id": other_id})
    assert other.get("/api/v1/social/goals/shared-with-me").json()[0]["title"] == "общая"
    other.post(f"/api/v1/social/friends/{fr[0]['id']}/block")
    assert client.get(f"/api/v1/social/users/{other_id}/profile").status_code == 404
    assert other.get(f"/api/v1/social/users/{me_id}/profile").status_code == 404
    assert other.get("/api/v1/social/goals/shared-with-me").json() == []
