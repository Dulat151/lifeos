"""Projects, cross-links, event completion, coins/quests/shop, streaks & restore, progress, Google calendars."""
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

from app.core.config import settings
from app.services import calendar_sync as cs


def _local_today():
    return datetime.now(ZoneInfo("Asia/Almaty")).date()


def _coins(c):
    return c.get("/api/v1/shop").json()["coins"]


# ================================================================ projects & links

def test_projects_kanban_progress_and_links(client, other):
    g = client.post("/api/v1/goals", json={"title": "Запустить блог", "category": "projects"}).json()
    p = client.post("/api/v1/projects", json={"title": "Блог", "status": "idea", "goal_id": g["id"]}).json()
    assert p["status"] == "idea" and p["progress"] == 0
    t1 = client.post("/api/v1/tasks", json={"title": "Домен", "project_id": p["id"]}).json()
    client.post("/api/v1/tasks", json={"title": "Дизайн", "project_id": p["id"]})
    client.patch(f"/api/v1/tasks/{t1['id']}", json={"status": "done"})
    n = client.post("/api/v1/notes", json={"title": "Идеи постов", "project_id": p["id"], "is_pinned": True}).json()
    assert n["is_pinned"] and n["project_id"] == p["id"]
    ev = client.post("/api/v1/calendar/events", json={
        "title": "Созвон", "starts_at": "2030-01-01T10:00:00Z", "ends_at": "2030-01-01T11:00:00Z",
        "project_id": p["id"]}).json()
    assert ev["project_id"] == p["id"]

    d = client.get(f"/api/v1/projects/{p['id']}").json()
    assert d["tasks_total"] == 2 and d["tasks_done"] == 1 and d["progress"] == 50.0
    assert [x["title"] for x in d["notes"]] == ["Идеи постов"] and d["events"][0]["title"] == "Созвон"
    assert d["goal"]["title"] == "Запустить блог"
    assert client.get("/api/v1/tasks", params={"project_id": p["id"]}).json()["total"] == 2

    # goal hub shows the project; kanban move to done gives XP once
    assert [x["title"] for x in client.get(f"/api/v1/goals/{g['id']}").json()["projects"]] == ["Блог"]
    xp0 = client.get("/api/v1/gamification/summary").json()["xp"]
    for _ in range(2):
        client.patch(f"/api/v1/projects/{p['id']}", json={"status": "done"})
    pd = client.get(f"/api/v1/projects/{p['id']}").json()
    assert pd["progress"] == 100.0 and pd["completed_at"]
    assert client.get("/api/v1/gamification/summary").json()["xp"] - xp0 >= 50
    assert any(r["type"] == "project" for r in client.get("/api/v1/dashboard/search", params={"q": "Блог"}).json())

    # isolation: other user cannot read, link or modify
    assert other.get(f"/api/v1/projects/{p['id']}").status_code == 404
    assert other.post("/api/v1/tasks", json={"title": "x", "project_id": p["id"]}).status_code in (404, 422)
    assert other.patch(f"/api/v1/projects/{p['id']}", json={"title": "hack"}).status_code == 404
    assert other.get("/api/v1/projects").json() == []

    # delete keeps tasks/notes, just unlinks them
    assert client.delete(f"/api/v1/projects/{p['id']}").status_code == 204
    assert client.get(f"/api/v1/notes/{n['id']}").json()["project_id"] is None
    assert client.get("/api/v1/projects").json() == []


def test_notes_pinned_first_and_habit_link(client):
    h = client.post("/api/v1/habits", json={"title": "Чтение"}).json()
    client.post("/api/v1/notes", json={"title": "Обычная"})
    client.post("/api/v1/notes", json={"title": "Закреплённая", "is_pinned": True, "habit_id": h["id"]})
    items = client.get("/api/v1/notes").json()["items"]
    assert items[0]["title"] == "Закреплённая" and items[0]["habit_id"] == h["id"]


# ================================================================ calendar completion

def test_event_completion_single_and_recurring(client):
    t = client.post("/api/v1/tasks", json={"title": "Подготовить отчёт"}).json()
    ev = client.post("/api/v1/calendar/events", json={
        "title": "Отчёт", "starts_at": "2030-01-01T10:00:00Z", "ends_at": "2030-01-01T11:00:00Z",
        "task_id": t["id"]}).json()
    xp0 = client.get("/api/v1/gamification/summary").json()["xp"]
    r = client.post(f"/api/v1/calendar/events/{ev['id']}/complete", json={"done": True})
    assert r.status_code == 200 and r.json()["completed_at"]
    client.post(f"/api/v1/calendar/events/{ev['id']}/complete", json={"done": True})
    occ = client.get("/api/v1/calendar/events", params={"start": "2030-01-01T00:00:00Z",
                                                       "end": "2030-01-02T00:00:00Z"}).json()
    assert occ[0]["done"] is True
    assert client.get(f"/api/v1/tasks/{t['id']}").json()["status"] == "done"
    gained = client.get("/api/v1/gamification/summary").json()["xp"] - xp0
    assert gained >= 5 + 10  # event + linked task (+ maybe achievement)

    rec = client.post("/api/v1/calendar/events", json={
        "title": "Пробежка", "starts_at": "2030-02-01T06:00:00Z", "ends_at": "2030-02-01T07:00:00Z",
        "recurrence_rule": "FREQ=DAILY;COUNT=3"}).json()
    assert client.post(f"/api/v1/calendar/events/{rec['id']}/complete", json={"done": True}).status_code == 422
    client.post(f"/api/v1/calendar/events/{rec['id']}/complete",
                json={"done": True, "occurrence_start": "2030-02-02T06:00:00Z"})
    occ = client.get("/api/v1/calendar/events", params={"start": "2030-02-01T00:00:00Z",
                                                       "end": "2030-02-04T00:00:00Z"}).json()
    assert [o["done"] for o in occ] == [False, True, False]
    client.post(f"/api/v1/calendar/events/{rec['id']}/complete",
                json={"done": False, "occurrence_start": "2030-02-02T06:00:00Z"})
    occ = client.get("/api/v1/calendar/events", params={"start": "2030-02-01T00:00:00Z",
                                                       "end": "2030-02-04T00:00:00Z"}).json()
    assert not any(o["done"] for o in occ)


# ================================================================ XP bonus, coins, quests, shop

def test_hard_task_bonus_and_coins_follow_xp(client):
    easy = client.post("/api/v1/tasks", json={"title": "Лёгкая", "priority": 3}).json()
    hard = client.post("/api/v1/tasks", json={"title": "Сложная", "priority": 1, "estimated_minutes": 180}).json()
    client.patch(f"/api/v1/tasks/{easy['id']}", json={"status": "done"})
    hist0 = client.get("/api/v1/gamification/xp-history").json()
    assert any(h["amount"] == 10 and h["reason"] == "task_done" for h in hist0)
    client.patch(f"/api/v1/tasks/{hard['id']}", json={"status": "done"})
    hist = client.get("/api/v1/gamification/xp-history").json()
    assert any(h["amount"] == 30 and h["reason"] == "task_done" for h in hist)

    c1 = _coins(client)
    assert c1 > 0
    client.patch(f"/api/v1/tasks/{hard['id']}", json={"status": "todo"})  # undo -> coins taken back
    assert _coins(client) == c1 - 6
    for _ in range(2):
        client.patch(f"/api/v1/tasks/{hard['id']}", json={"status": "done"})
        client.patch(f"/api/v1/tasks/{hard['id']}", json={"status": "todo"})
    assert _coins(client) == c1 - 6  # no farming


def test_quests_progress_and_single_claim(client):
    q = {x["code"]: x for x in client.get("/api/v1/quests").json()["quests"]}
    assert q["d_tasks3"]["progress"] == 0 and not q["d_tasks3"]["completed"]
    assert client.post("/api/v1/quests/d_tasks3/claim").status_code == 409
    for i in range(3):
        t = client.post("/api/v1/tasks", json={"title": f"t{i}"}).json()
        client.patch(f"/api/v1/tasks/{t['id']}", json={"status": "done"})
    q = {x["code"]: x for x in client.get("/api/v1/quests").json()["quests"]}
    assert q["d_tasks3"]["completed"] and q["w_tasks15"]["progress"] == 3
    coins0 = _coins(client)
    r = client.post("/api/v1/quests/d_tasks3/claim")
    assert r.status_code == 200 and r.json()["xp"] == 20
    assert _coins(client) == coins0 + 8  # quest coins only (quest XP itself grants no extra coins)
    assert client.post("/api/v1/quests/d_tasks3/claim").status_code == 409
    assert {x["code"]: x for x in client.get("/api/v1/quests").json()["quests"]}["d_tasks3"]["claimed"]

    # weekly review quest via note template category
    client.post("/api/v1/notes", json={"title": "Обзор недели", "category": "weekly_review"})
    q = {x["code"]: x for x in client.get("/api/v1/quests").json()["quests"]}
    assert q["w_review"]["completed"]
    assert client.post("/api/v1/quests/nope/claim").status_code == 404


def test_shop_buy_equip_and_limits(client, other):
    assert client.post("/api/v1/shop/theme_ocean/buy").status_code == 402
    from app.core.db import SessionLocal
    from app.models import User
    from app.services.rewards import grant_coins

    with SessionLocal() as db:
        uid = db.query(User).filter(User.email == "user@example.com").one().id
        grant_coins(db, uid, 200, "test", "test:grant")
        db.commit()
    r = client.post("/api/v1/shop/theme_ocean/buy")
    assert r.status_code == 200 and r.json()["coins"] == 140
    assert client.post("/api/v1/shop/theme_ocean/buy").status_code == 409
    assert client.post("/api/v1/shop/equip", json={"kind": "theme", "code": "theme_forest"}).status_code == 403
    client.post("/api/v1/shop/equip", json={"kind": "theme", "code": "theme_ocean"})
    me = client.get("/api/v1/users/me").json()
    assert me["settings"]["cosmetics"]["accent"] == "#38bdf8"
    client.post("/api/v1/shop/equip", json={"kind": "theme", "code": None})
    assert "accent" not in client.get("/api/v1/users/me").json()["settings"]["cosmetics"]
    for _ in range(3):
        assert client.post("/api/v1/shop/streak_freeze/buy").status_code == 200
    assert client.post("/api/v1/shop/streak_freeze/buy").status_code == 409  # max 3
    assert _coins(client) == 20
    assert _coins(other) == 0 and client.post("/api/v1/shop/unknown/buy").status_code == 404


# ================================================================ streaks

def test_streak_restore_grace_then_freeze(client):
    from app.core.db import SessionLocal
    from app.models import HabitLog, StreakFreeze, User

    today = _local_today()
    h = client.post("/api/v1/habits", json={"title": "Вода", "start_date": (today - timedelta(days=30)).isoformat()}).json()
    with SessionLocal() as db:
        uid = db.query(User).filter(User.email == "user@example.com").one().id
        for back in (2, 3, 4):  # active 4..2 days ago, missed yesterday
            db.add(HabitLog(user_id=uid, habit_id=h["id"], log_date=today - timedelta(days=back), status="done", value=1))
        db.commit()
    s = client.get("/api/v1/streaks").json()
    assert s["daily"]["current"] == 0 and s["restore"]["missed_yesterday"] and s["restore"]["free_available"]
    r = client.post("/api/v1/streaks/restore")
    assert r.status_code == 200 and r.json()["source"] == "weekly_grace"
    s = client.get("/api/v1/streaks").json()
    assert s["daily"]["current"] == 4 and not s["restore"]["missed_yesterday"]
    assert client.post("/api/v1/streaks/restore").status_code == 409

    # next week: same situation, grace used -> needs a freeze item
    with SessionLocal() as db:
        db.query(StreakFreeze).update({StreakFreeze.day: today - timedelta(days=3)})
        db.commit()
    assert client.get("/api/v1/streaks").json()["restore"]["free_available"] is False
    assert client.post("/api/v1/streaks/restore").status_code == 402
    assert "history" in s and isinstance(s["calendar"], list)


# ================================================================ dashboard, progress, report

def test_dashboard_progress_and_weekly_report(client):
    p = client.post("/api/v1/projects", json={"title": "Курс Python", "status": "in_progress"}).json()
    t = client.post("/api/v1/tasks", json={"title": "Урок 1", "project_id": p["id"]}).json()
    client.patch(f"/api/v1/tasks/{t['id']}", json={"status": "done"})
    client.post("/api/v1/dashboard/start-day", json={"priority_task_ids": [t["id"]]})
    d = client.get("/api/v1/dashboard").json()
    assert any(x["kind"] == "project" and x["title"] == "Курс Python" for x in d["continue"])
    assert {q["code"] for q in d["quests"]} >= {"d_tasks3", "d_plan"} and d["coins"] > 0
    assert next(q for q in d["quests"] if q["code"] == "d_plan")["completed"]
    hist = client.get("/api/v1/gamification/xp-history").json()
    assert any(h["reason"] == "daily_plan" for h in hist)

    for period in ("week", "month", "year"):
        pr = client.get("/api/v1/progress", params={"period": period}).json()
        assert pr["totals"]["tasks_done"] == 1 and pr["level"]["xp"] > 0 and pr["series"]
        assert sum(x["xp"] for x in pr["series"]) == pr["totals"]["xp"]
    rep = client.get("/api/v1/progress/weekly-report").json()
    assert rep["has_data"] and rep["metrics"]["tasks_done"]["value"] == 1
    assert any("Выполнено задач: 1" in s for s in rep["insights"])


def test_preferences_validated(client):
    assert client.patch("/api/v1/settings", json={"preferences": {"calendar_view": "week"}}).status_code == 200
    assert client.get("/api/v1/users/me").json()["settings"]["preferences"]["calendar_view"] == "week"
    assert client.patch("/api/v1/settings", json={"preferences": {"evil": "x"}}).status_code == 422
    assert client.patch("/api/v1/settings", json={"preferences": {"calendar_view": "decade"}}).status_code == 422


# ================================================================ Google calendars selection

class MultiGoogle:
    def __init__(self):
        self.cals = {"primary": {}, "team@group.calendar.google.com": {},
                     "ru.kz#holiday@group.v.calendar.google.com": {}}
        self.n = 0

    def add(self, cal, title, start):
        self.n += 1
        gid = f"e{self.n}"
        self.cals[cal][gid] = {"id": gid, "status": "confirmed", "summary": title,
                               "start": {"dateTime": start.isoformat()},
                               "end": {"dateTime": (start + timedelta(hours=1)).isoformat()},
                               "updated": datetime.now(UTC).isoformat()}

    def call(self, method, url, token, **kw):
        req = httpx.Request(method, url)
        if url.endswith("/calendarList"):
            return httpx.Response(200, request=req, json={"items": [
                {"id": "me@gmail.com", "primary": True, "summary": "Я", "accessRole": "owner"},
                {"id": "team@group.calendar.google.com", "summary": "Команда", "accessRole": "writer",
                 "backgroundColor": "#ff8800"},
                {"id": "ru.kz#holiday@group.v.calendar.google.com", "summary": "Праздники", "accessRole": "reader"}]})
        from urllib.parse import unquote

        path = unquote(url.split("/calendars/")[1])
        cal, rest = path.split("/events", 1)
        store = self.cals[cal]
        if method == "GET":
            return httpx.Response(200, request=req, json={"items": list(store.values())})
        if method == "POST":
            self.n += 1
            gid = f"e{self.n}"
            store[gid] = {"id": gid, **kw["json"]}
            return httpx.Response(200, request=req, json=store[gid])
        gid = rest.strip("/")
        if method == "PATCH":
            store[gid].update(kw["json"])
            return httpx.Response(200, request=req, json=store[gid])
        raise AssertionError((method, url))


def test_google_calendar_selection(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "cid")
    monkeypatch.setattr(settings, "google_client_secret", "secret")
    g = MultiGoogle()
    monkeypatch.setattr(cs, "_google_call", g.call)
    monkeypatch.setattr(cs, "google_access_token", lambda acc: "tok")
    from app.core.db import SessionLocal
    from app.models import ConnectedAccount, User

    with SessionLocal() as db:
        uid = db.query(User).one().id
        db.add(ConnectedAccount(user_id=uid, provider="google", access_token_enc=cs.encrypt("tok"), meta={}))
        db.commit()
    start = (datetime.now(UTC) + timedelta(days=2)).replace(microsecond=0)
    g.add("primary", "Личное", start)
    g.add("team@group.calendar.google.com", "Планёрка", start)
    g.add("ru.kz#holiday@group.v.calendar.google.com", "Праздник", start)

    cals = client.get("/api/v1/integrations/google/calendars").json()
    assert cals["calendars"][0]["id"] == "primary" and cals["selected"] == ["primary"]
    assert client.put("/api/v1/integrations/google/calendars", json={
        "selected": ["primary"], "write_calendar": "ru.kz#holiday@group.v.calendar.google.com"}).status_code == 422
    r = client.put("/api/v1/integrations/google/calendars", json={
        "selected": ["primary", "team@group.calendar.google.com", "ru.kz#holiday@group.v.calendar.google.com"],
        "write_calendar": "team@group.calendar.google.com"})
    assert r.status_code == 200, r.text
    s0 = datetime.now(UTC) - timedelta(days=1)
    titles = {o["title"]: o for o in client.get("/api/v1/calendar/events", params={
        "start": s0.isoformat(), "end": (s0 + timedelta(days=10)).isoformat()}).json()}
    assert set(titles) == {"Личное", "Планёрка", "Праздник"} and titles["Планёрка"]["color"] == "#ff8800"

    # new LIFE OS event goes to the chosen write calendar; edits of read-only holiday are not pushed
    client.post("/api/v1/calendar/events", json={"title": "Новое", "starts_at": start.isoformat(),
                                                 "ends_at": (start + timedelta(hours=1)).isoformat()})
    client.patch(f"/api/v1/calendar/events/{titles['Праздник']['event_id']}", json={"title": "Праздник (изм.)"})
    client.post("/api/v1/integrations/google/sync")
    assert "Новое" in [e["summary"] for e in g.cals["team@group.calendar.google.com"].values()]
    assert [e["summary"] for e in g.cals["ru.kz#holiday@group.v.calendar.google.com"].values()] == ["Праздник"]

    # deselecting a calendar removes its copies from LIFE OS only
    r = client.put("/api/v1/integrations/google/calendars", json={"selected": ["primary"], "write_calendar": "primary"})
    assert r.json()["removed"] == sorted(["team@group.calendar.google.com", "ru.kz#holiday@group.v.calendar.google.com"])
    titles = {o["title"] for o in client.get("/api/v1/calendar/events", params={
        "start": s0.isoformat(), "end": (s0 + timedelta(days=10)).isoformat()}).json()}
    assert titles == {"Личное"}
    assert len(g.cals["team@group.calendar.google.com"]) == 2

    cat = {c["id"]: c for c in client.get("/api/v1/integrations/catalog").json()}
    assert cat["google_calendar"]["connected"] and cat["notion"]["status"] == "planned"
    assert not cat["notion"]["connected"]

