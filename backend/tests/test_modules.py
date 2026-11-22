"""Learning, flashcards, books, journal, focus, finance, health, notes, analytics, AI, export, deletion, files."""
from datetime import UTC, date, datetime, timedelta

import pytest

from app.api.v1.ai import provider_dep
from app.main import app
from app.services.ai import LLMResult, Provider
from app.services.sm2 import SM2State, review


def test_learning_session_and_course_progress(client):
    s = client.post("/api/v1/learning/subjects", json={"title": "Математика"}).json()
    c = client.post("/api/v1/learning/courses", json={"title": "Анализ", "subject_id": s["id"]}).json()
    l1 = client.post("/api/v1/learning/lessons", json={"course_id": c["id"], "title": "Пределы"}).json()
    client.post("/api/v1/learning/lessons", json={"course_id": c["id"], "title": "Производные"})
    client.post(f"/api/v1/learning/lessons/{l1['id']}/toggle")
    r = client.post("/api/v1/learning/sessions", json={"course_id": c["id"], "started_at": datetime.now(UTC).isoformat(),
                                                        "duration_minutes": 45})
    assert r.status_code == 201
    d = client.get(f"/api/v1/learning/courses/{c['id']}/detail").json()
    assert d["course"]["progress"] == 50.0 and d["course"]["minutes_studied"] == 45
    dash = client.get("/api/v1/learning/dashboard").json()
    assert dash["minutes_today"] == 45 and dash["minutes_total"] == 45
    assert client.get(f"/api/v1/learning/subjects/{s['id']}/detail").json()["minutes_total"] == 45


def test_sm2_algorithm():
    st, due = review(SM2State(), 5, date(2026, 1, 1))
    assert (st.repetitions, st.interval_days, due) == (1, 1, date(2026, 1, 2))
    st, due = review(st, 5, due)
    assert st.interval_days == 6
    st, _ = review(st, 4, due)
    assert st.interval_days == round(6 * st.ease_factor)
    lapsed, _ = review(st, 1, due)
    assert lapsed.repetitions == 0 and lapsed.interval_days == 1 and lapsed.lapses == 1
    ef = SM2State(ease_factor=1.3)
    assert review(ef, 0, date.today())[0].ease_factor == 1.3
    with pytest.raises(ValueError):
        review(SM2State(), 6, date.today())


def test_flashcard_review_flow(client):
    d = client.post("/api/v1/flashcards/decks", json={"title": "English"}).json()
    c = client.post("/api/v1/flashcards/cards", json={"deck_id": d["id"], "front": "cat", "back": "кот"}).json()
    assert c["stage"] == "new"
    q = client.get("/api/v1/flashcards/study").json()
    assert [x["id"] for x in q] == [c["id"]]
    r = client.post(f"/api/v1/flashcards/cards/{c['id']}/review", json={"grade": 4}).json()
    assert r["repetitions"] == 1 and r["stage"] == "learning" and r["due_date"]
    assert client.get("/api/v1/flashcards/study").json() == []  # not due until tomorrow
    assert len(client.get(f"/api/v1/flashcards/cards/{c['id']}/history").json()) == 1
    decks = client.get("/api/v1/flashcards/decks").json()
    assert decks[0]["total"] == 1 and decks[0]["learning"] == 1
    assert client.post(f"/api/v1/flashcards/cards/{c['id']}/review", json={"grade": 9}).status_code == 422


def test_books_progress(client):
    b = client.post("/api/v1/books", json={"title": "Атомные привычки", "author": "Клир", "total_pages": 300}).json()
    client.post(f"/api/v1/books/{b['id']}/sessions", json={"pages": 100, "minutes": 60})
    assert client.get(f"/api/v1/books/{b['id']}").json()["status"] == "reading"
    r = client.post(f"/api/v1/books/{b['id']}/sessions", json={"end_page": 300, "minutes": 120})
    assert r.json()["pages"] == 200
    bk = client.get(f"/api/v1/books/{b['id']}").json()
    assert bk["status"] == "completed" and bk["progress"] == 100
    st = client.get("/api/v1/books/stats").json()
    assert st["books_completed"] == 1 and st["pages_read"] == 300 and st["reading_minutes"] == 180
    client.post(f"/api/v1/books/{b['id']}/notes", json={"kind": "quote", "text": "1% лучше каждый день", "page": 5})
    assert len(client.get(f"/api/v1/books/{b['id']}/notes").json()) == 1
    assert client.post(f"/api/v1/books/{b['id']}/sessions", json={"end_page": 999}).status_code == 422


def test_journal_entry_private_and_export(client):
    r = client.post("/api/v1/journal/entries", json={"entry_date": date.today().isoformat(), "kind": "gratitude",
                                                     "body": "Благодарен за семью", "mood": 8, "tags": ["семья"]})
    assert r.status_code == 201 and r.json()["is_private"] is True
    assert client.get("/api/v1/journal/entries?q=семью").json()["total"] == 1
    assert len(client.get("/api/v1/journal/templates").json()) == 4
    assert "Благодарен" in client.get("/api/v1/journal/export.md").text


def test_focus_timer_state_machine(client):
    s = client.post("/api/v1/focus/start", json={"planned_minutes": 25}).json()
    assert client.post("/api/v1/focus/start", json={}).status_code == 409
    assert client.post(f"/api/v1/focus/{s['id']}/pause").json()["status"] == "paused"
    assert client.post(f"/api/v1/focus/{s['id']}/pause").status_code == 409
    assert client.post(f"/api/v1/focus/{s['id']}/resume").json()["status"] == "running"
    assert client.get("/api/v1/focus/active").json()["id"] == s["id"]
    # simulate 30 minutes of focus by moving the segment start back
    from app.core.db import SessionLocal
    from app.models import FocusSession

    with SessionLocal() as db:
        fs = db.get(FocusSession, __import__("uuid").UUID(s["id"]))
        fs.segment_started_at = datetime.now(UTC) - timedelta(minutes=30)
        db.commit()
    f = client.post(f"/api/v1/focus/{s['id']}/finish").json()
    assert f["status"] == "completed" and 1790 <= f["focused_seconds"] <= 1810
    st = client.get("/api/v1/focus/stats").json()
    assert st["today_minutes"] == 30 and st["completed_sessions"] == 1
    assert client.get("/api/v1/focus/active").json() is None
    s2 = client.post("/api/v1/focus/start", json={}).json()
    assert client.post(f"/api/v1/focus/{s2['id']}/cancel").json()["status"] == "cancelled"


def test_finance_report_and_budget(client):
    today = date.today()
    client.post("/api/v1/finance/transactions", json={"kind": "income", "amount": "500000", "occurred_on":
                                                      today.isoformat(), "category": "salary"})
    client.post("/api/v1/finance/transactions", json={"kind": "expense", "amount": "120000.50", "occurred_on":
                                                      today.isoformat(), "category": "food"})
    client.post("/api/v1/finance/transactions", json={"kind": "expense", "amount": "10", "currency": "USD",
                                                      "occurred_on": today.isoformat()})
    client.post("/api/v1/finance/budgets", json={"category": "food", "month": today.isoformat(),
                                                 "limit_amount": "100000"})
    rep = client.get("/api/v1/finance/report").json()
    assert rep["currency"] == "KZT" and rep["income"] == "500000.00" and rep["expense"] == "120000.50"
    assert rep["balance"] == "379999.50"
    assert rep["budgets"][0]["percent"] == 120.0
    assert rep["other_currencies"]["USD"]["expense"] == "10.00"
    assert client.post("/api/v1/finance/transactions", json={"kind": "expense", "amount": "-5",
                                                             "occurred_on": today.isoformat()}).status_code == 422
    sg = client.post("/api/v1/finance/savings-goals", json={"title": "Ноутбук", "target_amount": "600000"}).json()
    t = client.post("/api/v1/finance/transactions", json={"kind": "expense", "amount": "50000", "occurred_on":
                                                          today.isoformat(), "savings_goal_id": sg["id"]}).json()
    assert client.get(f"/api/v1/finance/savings-goals/{sg['id']}").json()["saved_amount"] == "50000.00"
    client.delete(f"/api/v1/finance/transactions/{t['id']}")
    assert client.get(f"/api/v1/finance/savings-goals/{sg['id']}").json()["saved_amount"] == "0.00"


def test_subscriptions_generate_transactions(client):
    past = (date.today() - timedelta(days=40)).isoformat()
    client.post("/api/v1/finance/subscriptions", json={"title": "Spotify", "amount": "2000", "next_payment_on": past})
    assert client.post("/api/v1/finance/subscriptions/process").json()["created"] == 2
    assert client.post("/api/v1/finance/subscriptions/process").json()["created"] == 0


def test_health_and_workouts(client):
    ex = client.post("/api/v1/health/exercises", json={"name": "Присед"}).json()
    w = client.post("/api/v1/health/workouts", json={"title": "Ноги", "performed_on": date.today().isoformat(),
                                                     "duration_minutes": 50, "sets": [
                                                         {"exercise_id": ex["id"], "set_number": 1, "reps": 10,
                                                          "weight_kg": 60}]}).json()
    assert len(w["sets"]) == 1
    client.post("/api/v1/health/logs", json={"kind": "sleep", "log_date": date.today().isoformat(), "value": 7.5})
    assert client.post("/api/v1/health/logs", json={"kind": "sleep", "log_date": date.today().isoformat(),
                                                    "value": 30}).status_code == 422
    s = client.get("/api/v1/health/summary").json()
    assert s["workouts"] == 1 and s["metrics"]["sleep"]["average"] == 7.5
    assert client.get(f"/api/v1/health/exercises/{ex['id']}/progress").json()[0]["max_weight"] == 60


def test_notes_links_and_graph(client):
    g = client.post("/api/v1/goals", json={"title": "Цель"}).json()
    a = client.post("/api/v1/notes", json={"title": "Python", "content": "base"}).json()
    b = client.post("/api/v1/notes", json={"title": "FastAPI", "content": "Основано на [[python]]",
                                           "goal_id": g["id"]}).json()
    bl = client.get(f"/api/v1/notes/{a['id']}/backlinks").json()
    assert bl["backlinks"][0]["id"] == b["id"]
    graph = client.get("/api/v1/notes/graph").json()
    assert {"source": b["id"], "target": a["id"], "type": "link"} in graph["edges"]
    assert any(n["type"] == "goal" for n in graph["nodes"])


def test_analytics_real_metrics(client):
    t1 = client.post("/api/v1/tasks", json={"title": "1", "due_at": datetime.now(UTC).isoformat()}).json()
    client.post("/api/v1/tasks", json={"title": "2", "due_at": datetime.now(UTC).isoformat()})
    client.patch(f"/api/v1/tasks/{t1['id']}", json={"status": "done"})
    h = client.post("/api/v1/habits", json={"title": "h"}).json()
    client.post(f"/api/v1/habits/{h['id']}/check", json={})
    a = client.get("/api/v1/analytics/overview?period=day").json()
    assert a["task_completion_rate"] == 50.0 and a["habit_completion_rate"] == 100.0
    assert a["productivity_score"] == 75.0  # (0.4*50 + 0.4*100) / 0.8
    assert "previous" in a
    empty = client.get("/api/v1/analytics/overview?start=2020-01-01&end=2020-01-31").json()
    assert empty["task_completion_rate"] is None and empty["productivity_score"] is None
    csv = client.get("/api/v1/analytics/export.csv?period=week")
    assert csv.status_code == 200 and csv.text.startswith("date,tasks_done")
    dash = client.get("/api/v1/dashboard").json()
    assert dash["stats"]["tasks_done_today"] == 1 and dash["stats"]["current_streak"] == 1


def test_dashboard_layout_and_day(client):
    t = client.post("/api/v1/tasks", json={"title": "Важное"}).json()
    r = client.put("/api/v1/dashboard/layout", json={"widgets": [{"id": "habits", "visible": False},
                                                                 {"id": "evil", "visible": True}]})
    assert r.json()["widgets"] == [{"id": "habits", "visible": False}]
    assert client.get("/api/v1/settings").json()["dashboard_layout"]["widgets"][0]["id"] == "habits"
    client.post("/api/v1/dashboard/start-day", json={"priority_task_ids": [t["id"]], "intention": "Фокус"})
    assert client.get("/api/v1/dashboard").json()["priorities"][0]["id"] == t["id"]
    e = client.post("/api/v1/dashboard/end-day", json={"reflection": "Хороший день", "mood": 7}).json()
    assert e["journal_entry_id"]
    assert client.get("/api/v1/dashboard/search?q=Важ").json()[0]["type"] == "task"


class FakeProvider(Provider):
    def __init__(self):
        self.seen = None

    def complete(self, system, messages):
        self.seen = messages[-1]["content"]
        return LLMResult(text="Предлагаю задачу", tool_calls=[
            {"name": "create_task", "arguments": {"title": "Прочитать главу 1", "priority": 2}},
            {"name": "drop_database", "arguments": {}}])


def test_ai_requires_confirmation_and_context(client):
    assert client.post("/api/v1/ai/chat", json={"message": "hi"}).status_code == 503  # no key -> honest error
    client.post("/api/v1/journal/entries", json={"entry_date": date.today().isoformat(), "body": "SECRET-JOURNAL"})
    client.post("/api/v1/goals", json={"title": "VISIBLE-GOAL"})
    fake = FakeProvider()
    app.dependency_overrides[provider_dep] = lambda: fake
    try:
        r = client.post("/api/v1/ai/chat", json={"message": "Что делать?", "mode": "plan_day"}).json()
    finally:
        app.dependency_overrides.clear()
    assert "VISIBLE-GOAL" in fake.seen and "SECRET-JOURNAL" not in fake.seen  # journal not allowed by default
    assert len(r["actions"]) == 1 and r["actions"][0]["status"] == "pending"  # unknown tool dropped
    assert client.get("/api/v1/tasks").json()["total"] == 0  # nothing created before confirmation
    a = client.post(f"/api/v1/ai/actions/{r['actions'][0]['id']}/confirm").json()
    assert a["status"] == "applied"
    assert client.get("/api/v1/tasks").json()["items"][0]["title"] == "Прочитать главу 1"
    assert client.post(f"/api/v1/ai/actions/{a['id']}/confirm").status_code == 409
    conv = client.get(f"/api/v1/ai/conversations/{r['conversation_id']}").json()
    assert [m["role"] for m in conv["messages"]] == ["user", "assistant"]
    client.patch("/api/v1/settings", json={"ai_enabled": False})
    assert client.post("/api/v1/ai/chat", json={"message": "hi"}).status_code == 403


def test_files_upload_validation(client):
    pdf = b"%PDF-1.4 test"
    r = client.post("/api/v1/files", files={"file": ("doc.pdf", pdf, "application/pdf")})
    assert r.status_code == 201
    fid = r.json()["id"]
    assert client.get(f"/api/v1/files/{fid}/download").content == pdf
    assert client.post("/api/v1/files", files={"file": ("x.exe", b"MZ", "application/x-msdownload")}).status_code == 415
    assert client.post("/api/v1/files", files={"file": ("fake.pdf", b"MZ...", "application/pdf")}).status_code == 415
    assert client.delete(f"/api/v1/files/{fid}").status_code == 204


def test_personal_tools(client):
    w = client.post("/api/v1/wheel-of-life", json={"assessed_on": date.today().isoformat(),
                                                   "scores": {"health": 8, "career": 6}}).json()
    assert w["average"] == 7.0
    assert client.post("/api/v1/wheel-of-life", json={"assessed_on": date.today().isoformat(),
                                                      "scores": {"health": 11}}).status_code == 422
    b = client.post("/api/v1/bucket-list", json={"title": "Увидеть Чарын"}).json()
    client.patch(f"/api/v1/bucket-list/{b['id']}", json={"status": "done"})
    tl = client.get("/api/v1/timeline").json()
    assert any(x["title"] == "Увидеть Чарын" for x in tl)
    vb = client.post("/api/v1/vision-boards", json={"title": "2027"}).json()
    assert client.post("/api/v1/vision-items", json={"board_id": vb["id"], "content": "Дом"}).status_code == 201
    c = client.post("/api/v1/challenges", json={"title": "5 задач", "metric": "tasks_done", "target": 1,
                                                "start_date": date.today().isoformat(),
                                                "end_date": date.today().isoformat()}).json()
    t = client.post("/api/v1/tasks", json={"title": "x"}).json()
    client.patch(f"/api/v1/tasks/{t['id']}", json={"status": "done"})
    ch = client.get("/api/v1/challenges").json()[0]
    assert ch["id"] == c["id"] and ch["value"] == 1 and ch["completed_at"]


def test_export_and_account_deletion(client):
    client.post("/api/v1/goals", json={"title": "Экспорт"})
    exp = client.get("/api/v1/exports/full")
    data = exp.json()
    assert data["goals"][0]["title"] == "Экспорт"
    assert "password_hash" not in exp.text and "refresh_token_hash" not in exp.text
    assert client.post("/api/v1/users/me/delete", json={"password": "secret123", "confirm": "nope"}).status_code == 400
    assert client.post("/api/v1/users/me/delete", json={"password": "wrong", "confirm": "DELETE"}).status_code == 400
    assert client.post("/api/v1/users/me/delete", json={"password": "secret123", "confirm": "DELETE"}).status_code == 204
    from fastapi.testclient import TestClient

    c = TestClient(app)
    assert c.post("/api/v1/auth/login", json={"email": "user@example.com", "password": "secret123"}).status_code == 401
    from sqlalchemy import func, select

    from app.core.db import SessionLocal
    from app.models import Goal

    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Goal)) == 0
