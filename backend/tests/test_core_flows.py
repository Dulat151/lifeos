"""Main user scenarios (section 31): goals, milestones, tasks, habits, calendar, reminders, XP."""
from datetime import UTC, datetime, timedelta

from app.core.db import SessionLocal
from app.services.reminders import dispatch_due, process_deliveries


def test_goal_milestone_task_progress(client):
    g = client.post("/api/v1/goals", json={"title": "Выучить английский", "category": "languages"}).json()
    m1 = client.post(f"/api/v1/goals/{g['id']}/milestones", json={"title": "A2"}).json()
    m2 = client.post(f"/api/v1/goals/{g['id']}/milestones", json={"title": "B1"}).json()
    t1 = client.post("/api/v1/tasks", json={"title": "Урок 1", "milestone_id": m1["id"]}).json()
    client.post("/api/v1/tasks", json={"title": "Урок 2", "milestone_id": m1["id"]})
    assert t1["goal_id"] == g["id"]  # goal inferred from milestone
    assert client.get(f"/api/v1/goals/{g['id']}").json()["progress"] == 0
    client.patch(f"/api/v1/tasks/{t1['id']}", json={"status": "done"})
    d = client.get(f"/api/v1/goals/{g['id']}").json()
    # m1 = 50%, m2 = 0% -> 25%
    assert d["progress"] == 25.0
    assert {m["id"]: m["progress"] for m in d["milestones"]}[m1["id"]] == 50.0
    client.post(f"/api/v1/goals/{g['id']}/milestones/{m2['id']}/toggle")
    assert client.get(f"/api/v1/goals/{g['id']}").json()["progress"] == 75.0
    r = client.patch(f"/api/v1/goals/{g['id']}", json={"status": "completed"})
    assert r.json()["progress"] == 100 and r.json()["completed_at"]
    hist = client.get(f"/api/v1/goals/{g['id']}").json()["history"]
    assert any(h["field"] == "status" for h in hist)


def test_goal_validation(client):
    r = client.post("/api/v1/goals", json={"title": "x", "start_date": "2026-05-01", "deadline": "2026-04-01"})
    assert r.status_code == 422
    assert client.post("/api/v1/goals", json={"title": ""}).status_code == 422
    assert client.post("/api/v1/goals", json={"title": "x", "category": "nope"}).status_code == 422


def test_tasks_views_kanban_bulk_and_history(client):
    now = datetime.now(UTC)
    a = client.post("/api/v1/tasks", json={"title": "A", "due_at": (now - timedelta(days=1)).isoformat(),
                                           "tags": ["work"], "checklist": [{"text": "c1"}]}).json()
    b = client.post("/api/v1/tasks", json={"title": "B", "due_at": (now + timedelta(days=5)).isoformat()}).json()
    assert a["tags"] == ["work"] and a["checklist"][0]["text"] == "c1"
    ids = lambda view: {t["id"] for t in client.get(f"/api/v1/tasks?view={view}").json()["items"]}  # noqa: E731
    assert a["id"] in ids("overdue") and a["id"] in ids("today")
    assert b["id"] in ids("upcoming")
    r = client.post(f"/api/v1/tasks/{b['id']}/move", json={"status": "in_progress", "position": 1.5})
    assert r.json()["status"] == "in_progress"
    assert client.post("/api/v1/tasks/bulk", json={"ids": [a["id"], b["id"]], "action": "status",
                                                   "status": "done"}).json()["updated"] == 2
    assert {a["id"], b["id"]} <= ids("completed")
    hist = client.get(f"/api/v1/tasks/{b['id']}/history").json()
    assert [h["new"] for h in hist if h["field"] == "status"][:2] == ["done", "in_progress"]
    assert client.get("/api/v1/tasks?q=A&tag=work").json()["total"] == 1


def test_task_dependencies_and_cycles(client):
    a = client.post("/api/v1/tasks", json={"title": "A"}).json()
    b = client.post("/api/v1/tasks", json={"title": "B"}).json()
    assert client.post(f"/api/v1/tasks/{b['id']}/dependencies", json={"depends_on_id": a["id"]}).status_code == 201
    assert client.get(f"/api/v1/tasks/{b['id']}").json()["blocked"] is True
    assert client.patch(f"/api/v1/tasks/{b['id']}", json={"status": "done"}).status_code == 409
    assert client.post(f"/api/v1/tasks/{a['id']}/dependencies", json={"depends_on_id": b["id"]}).status_code == 409
    client.patch(f"/api/v1/tasks/{a['id']}", json={"status": "done"})
    assert client.patch(f"/api/v1/tasks/{b['id']}", json={"status": "done"}).status_code == 200


def test_recurring_task_spawns_next(client):
    due = datetime.now(UTC) + timedelta(hours=1)
    t = client.post("/api/v1/tasks", json={"title": "Отчёт", "due_at": due.isoformat(),
                                           "recurrence_rule": "FREQ=WEEKLY"}).json()
    client.patch(f"/api/v1/tasks/{t['id']}", json={"status": "done"})
    items = client.get("/api/v1/tasks?view=upcoming").json()["items"]
    nxt = [x for x in items if x["title"] == "Отчёт"]
    assert len(nxt) == 1
    assert abs((datetime.fromisoformat(nxt[0]["due_at"]) - due).total_seconds() - 7 * 86400) < 3600 * 2
    assert client.post("/api/v1/tasks", json={"title": "x", "recurrence_rule": "garbage"}).status_code == 422


def test_quick_add_and_subtasks(client):
    t = client.post("/api/v1/tasks/quick", json={"text": "Купить молоко #дом !1 завтра"}).json()
    assert t["title"] == "Купить молоко" and t["tags"] == ["дом"] and t["priority"] == 1 and t["due_at"]
    s = client.post("/api/v1/tasks", json={"title": "sub", "parent_id": t["id"]}).json()
    client.patch(f"/api/v1/tasks/{s['id']}", json={"status": "done"})
    assert client.get(f"/api/v1/tasks/{t['id']}").json()["subtasks_done"] == 1


def test_xp_not_awarded_twice(client):
    t = client.post("/api/v1/tasks", json={"title": "X"}).json()
    for _ in range(3):
        client.patch(f"/api/v1/tasks/{t['id']}", json={"status": "done"})
    xp = client.get("/api/v1/gamification/summary").json()["xp"]
    assert xp == 10 + 20  # task + "first_task" achievement reward
    client.patch(f"/api/v1/tasks/{t['id']}", json={"status": "todo"})
    assert client.get("/api/v1/gamification/summary").json()["xp"] == 20  # correction
    client.patch(f"/api/v1/tasks/{t['id']}", json={"status": "done"})
    client.patch(f"/api/v1/tasks/{t['id']}", json={"status": "todo"})
    client.patch(f"/api/v1/tasks/{t['id']}", json={"status": "done"})
    assert client.get("/api/v1/gamification/summary").json()["xp"] == 30  # never more than one award
    hist = client.get("/api/v1/gamification/xp-history").json()
    assert sum(1 for h in hist if h["reason"] == "correction") == 2
    ach = {a["code"]: a for a in client.get("/api/v1/achievements").json()}
    assert ach["first_task"]["unlocked_at"]


def test_habit_check_streak_and_dedup(client):
    from datetime import date

    from app.core.time import safe_tz

    today = datetime.now(safe_tz("Asia/Almaty")).date()
    start = (today - timedelta(days=4)).isoformat()
    h = client.post("/api/v1/habits", json={"title": "Вода", "start_date": start}).json()
    for i in range(4, 0, -1):
        d = (today - timedelta(days=i)).isoformat()
        assert client.post(f"/api/v1/habits/{h['id']}/check", json={"log_date": d}).status_code == 200
    # repeated check same day is idempotent
    client.post(f"/api/v1/habits/{h['id']}/check", json={})
    client.post(f"/api/v1/habits/{h['id']}/check", json={})
    st = client.get(f"/api/v1/habits/{h['id']}/stats").json()
    assert st["current_streak"] == 5 and st["total_completions"] == 5 and st["completion_rate"] == 100
    xp = [x for x in client.get("/api/v1/gamification/xp-history").json() if x["reason"] == "habit_check"]
    assert len(xp) == 5
    # future date rejected
    fut = (today + timedelta(days=1)).isoformat()
    assert client.post(f"/api/v1/habits/{h['id']}/check", json={"log_date": fut}).status_code == 422
    # skip keeps the streak; heatmap returns data
    assert len(client.get(f"/api/v1/habits/{h['id']}/heatmap?days=30").json()) == 30
    assert isinstance(date.fromisoformat(start), date)


def test_numeric_habit_accumulates(client):
    h = client.post("/api/v1/habits", json={"title": "Шаги", "kind": "numeric", "target": 10000, "unit": "шаг",
                                            "allow_multiple_per_day": True}).json()
    client.post(f"/api/v1/habits/{h['id']}/check", json={"value": 6000})
    r = client.post(f"/api/v1/habits/{h['id']}/check", json={"value": 5000}).json()
    assert r["value"] == 11000
    assert client.get(f"/api/v1/habits/{h['id']}").json()["current_streak"] == 1
    assert client.post("/api/v1/habits", json={"title": "x", "frequency": "selected_days"}).status_code == 422


def test_calendar_recurring_dst_and_ics(client):
    # Weekly 09:00 in New York across the 2026 DST change (Mar 8): UTC hour shifts 14 -> 13
    start = datetime(2026, 3, 2, 14, 0, tzinfo=UTC)  # 09:00 EST
    ev = client.post("/api/v1/calendar/events", json={
        "title": "Standup", "starts_at": start.isoformat(), "ends_at": (start + timedelta(minutes=30)).isoformat(),
        "timezone": "America/New_York", "recurrence_rule": "FREQ=WEEKLY;COUNT=3"}).json()
    occ = client.get("/api/v1/calendar/events", params={"start": "2026-03-01T00:00:00Z",
                                                        "end": "2026-03-31T00:00:00Z"}).json()
    hours = [datetime.fromisoformat(o["starts_at"]).astimezone(UTC).hour for o in occ]
    assert hours == [14, 13, 13]
    ics = client.get("/api/v1/calendar/export.ics")
    assert ics.status_code == 200 and b"BEGIN:VEVENT" in ics.content and b"RRULE" in ics.content
    client.delete(f"/api/v1/calendar/events/{ev['id']}")
    r = client.post("/api/v1/calendar/import.ics", files={"file": ("a.ics", ics.content, "text/calendar")})
    assert r.json()["created"] == 1
    assert client.post("/api/v1/calendar/events", json={
        "title": "bad", "starts_at": start.isoformat(), "ends_at": start.isoformat()}).status_code == 422
    assert client.post("/api/v1/calendar/events", json={
        "title": "naive", "starts_at": "2026-03-02T10:00:00", "ends_at": "2026-03-02T11:00:00"}).status_code == 422


def test_reminder_engine_delivery_dedup_retry(client):
    fire = datetime.now(UTC) - timedelta(minutes=1)
    r = client.post("/api/v1/reminders", json={"title": "Пить воду", "first_fire_at": fire.isoformat(),
                                               "channels": ["in_app", "email", "browser"],
                                               "recurrence_rule": "FREQ=DAILY"}).json()
    with SessionLocal() as db:
        assert dispatch_due(db) == 1
        assert dispatch_due(db) == 0  # dedup: next occurrence is tomorrow
        stats = process_deliveries(db)
    assert stats["sent"] == 1  # in_app
    assert stats["failed"] == 1  # email: SMTP not configured -> honest failure
    notes = client.get("/api/v1/notifications").json()
    assert len(notes) == 1 and notes[0]["title"] == "Пить воду"
    assert client.get("/api/v1/notifications/unread-count").json()["count"] == 1
    assert len(client.post("/api/v1/notifications/browser-pending").json()) == 1
    assert client.post("/api/v1/notifications/browser-pending").json() == []
    dels = {d["channel"]: d for d in client.get("/api/v1/notifications/deliveries").json()}
    assert dels["email"]["status"] == "failed" and "SMTP" in dels["email"]["last_error"]
    assert dels["browser"]["status"] == "sent"
    assert client.post(f"/api/v1/notifications/deliveries/{dels['email']['id']}/retry").json()["status"] == "pending"
    rem = client.get("/api/v1/reminders").json()[0]
    assert datetime.fromisoformat(rem["next_fire_at"]) > datetime.now(UTC)
    sn = client.post(f"/api/v1/reminders/{r['id']}/snooze", json={"minutes": 5}).json()
    assert datetime.fromisoformat(sn["next_fire_at"]) < datetime.now(UTC) + timedelta(minutes=6)
    client.post(f"/api/v1/notifications/{notes[0]['id']}/read")
    assert client.get("/api/v1/notifications/unread-count").json()["count"] == 0


def test_quiet_hours_postpone_email(client):
    from app.models import UserSettings
    from app.services.reminders import quiet_until

    us = UserSettings(quiet_hours_start="22:00", quiet_hours_end="07:00")
    late = datetime(2026, 1, 1, 18, 0, tzinfo=UTC)  # 23:00 Almaty
    until = quiet_until(us, "Asia/Almaty", late)
    assert until == datetime(2026, 1, 2, 2, 0, tzinfo=UTC)  # 07:00 Almaty
    assert quiet_until(us, "Asia/Almaty", datetime(2026, 1, 1, 6, 0, tzinfo=UTC)) is None  # 11:00


def test_event_reminders_created(client):
    start = datetime.now(UTC) + timedelta(hours=2)
    ev = client.post("/api/v1/calendar/events", json={
        "title": "Встреча", "starts_at": start.isoformat(), "ends_at": (start + timedelta(hours=1)).isoformat(),
        "reminder_minutes_before": [15, 60]}).json()
    assert sorted(client.get(f"/api/v1/calendar/events/{ev['id']}/reminders").json()) == [15, 60]
    rems = [r for r in client.get("/api/v1/reminders").json() if r["entity_id"] == ev["id"]]
    assert len(rems) == 2


def test_habit_reminder_time_creates_backend_reminder(client):
    h = client.post("/api/v1/habits", json={"title": "Медитация", "reminder_time": "08:00", "frequency": "selected_days",
                                            "schedule": {"weekdays": [0, 2, 4]}}).json()
    rems = [r for r in client.get("/api/v1/reminders").json() if r["entity_id"] == h["id"]]
    assert len(rems) == 1 and rems[0]["recurrence_rule"].startswith("FREQ=WEEKLY;BYDAY=MO,WE,FR")
    client.patch(f"/api/v1/habits/{h['id']}", json={"reminder_time": None})
    assert not [r for r in client.get("/api/v1/reminders").json() if r["entity_id"] == h["id"]]
