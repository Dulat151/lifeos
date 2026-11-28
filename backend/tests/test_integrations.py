"""Calendar sync (Google, CalDAV), Gemini provider, SSRF guard and notes import (Google Keep / Apple Notes)."""
import io
import json
import zipfile
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from icalendar import Calendar

from app.core.config import settings
from app.services import ai as ai_mod
from app.services import calendar_sync as cs
from app.services.caldav import CalDAVError, check_url


def _when(days=3, hour=10):
    d = (datetime.now(UTC) + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)
    return d, d + timedelta(hours=1)


def _events(c):
    s = datetime.now(UTC) - timedelta(days=40)
    return c.get("/api/v1/calendar/events", params={"start": s.isoformat(),
                                                    "end": (s + timedelta(days=390)).isoformat()}).json()


# ================================================================ CalDAV

class FakeDAV:
    """In-memory CalDAV calendar: href -> (etag, ical)."""

    def __init__(self, base="https://caldav.example.com/cal/"):
        self.base, self.items, self.n = base, {}, 0

    def _etag(self):
        self.n += 1
        return f'"{self.n}"'

    def add_remote(self, uid, title, start, end, rrule=None):
        rr = f"RRULE:{rrule}\r\n" if rrule else ""
        ical = (f"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Apple//EN\r\nBEGIN:VEVENT\r\nUID:{uid}\r\n"
                f"DTSTAMP:20260101T000000Z\r\nDTSTART:{start:%Y%m%dT%H%M%SZ}\r\nDTEND:{end:%Y%m%dT%H%M%SZ}\r\n"
                f"SUMMARY:{title}\r\nLAST-MODIFIED:{datetime.now(UTC):%Y%m%dT%H%M%SZ}\r\n{rr}"
                f"END:VEVENT\r\nEND:VCALENDAR\r\n")
        href = f"{self.base}{uid}.ics"
        self.items[href] = (self._etag(), ical)
        return href

    def fetch(self, url, start, end):
        return [(h, e, d if isinstance(d, str) else d.decode()) for h, (e, d) in self.items.items()]

    def put(self, href, ical, create=False):
        assert not (create and href in self.items)
        et = self._etag()
        self.items[href] = (et, ical)
        return et

    def delete(self, href):
        self.items.pop(href, None)

    def discover(self, url):
        return [{"url": self.base, "name": "Домашний", "color": "#ff0000"}]

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass

    def summaries(self):
        return sorted(str(Calendar.from_ical(d).walk("VEVENT")[0]["summary"]) for _, d in self.items.values())


@pytest.fixture
def dav(monkeypatch):
    fake = FakeDAV()
    monkeypatch.setattr(cs, "CalDAVClient", lambda *a, **k: fake)
    monkeypatch.setattr("app.api.v1.integrations.CalDAVClient", lambda *a, **k: fake)
    monkeypatch.setattr(settings, "caldav_allow_private_hosts", True)
    return fake


def _connect_caldav(c, dav):
    cals = c.post("/api/v1/integrations/caldav/discover", json={"username": "me@icloud.com", "password": "abcd-efgh"})
    assert cals.status_code == 200, cals.text
    r = c.post("/api/v1/integrations/caldav", json={
        "server_url": "https://caldav.example.com/", "username": "me@icloud.com", "password": "abcd-efgh",
        "calendar_url": cals.json()["calendars"][0]["url"], "calendar_name": "Домашний"})
    assert r.status_code == 200, r.text
    return r.json()


def test_caldav_two_way_sync(client, dav):
    s, e = _when()
    dav.add_remote("remote-1", "Стоматолог", s, e)
    dav.add_remote("remote-2", "Йога", s + timedelta(days=1), e + timedelta(days=1), rrule="FREQ=WEEKLY;COUNT=4")
    local = client.post("/api/v1/calendar/events", json={
        "title": "Из LIFE OS", "starts_at": (s + timedelta(days=2)).isoformat(),
        "ends_at": (e + timedelta(days=2)).isoformat(), "timezone": "Asia/Almaty"}).json()

    stats = _connect_caldav(client, dav)
    assert stats["pulled_created"] == 2 and stats["pushed_created"] == 1
    assert dav.summaries() == sorted(["Йога", "Из LIFE OS", "Стоматолог"])
    titles = [o["title"] for o in _events(client)]
    assert titles.count("Йога") == 4 and "Стоматолог" in titles

    # pushed event keeps its time zone (TZID + VTIMEZONE for Apple)
    pushed = next(d for _, d in dav.items.values() if b"Asia/Almaty" in (d if isinstance(d, bytes) else d.encode()))
    assert b"BEGIN:VTIMEZONE" in pushed

    # local edit -> pushed; remote edit -> pulled; remote deletion -> local soft delete
    client.patch(f"/api/v1/calendar/events/{local['id']}", json={"title": "Из LIFE OS (изм.)"})
    dav.add_remote("remote-1", "Стоматолог 15:00", s, e)
    dav.delete(f"{dav.base}remote-2.ics")
    r = client.post("/api/v1/integrations/caldav/sync").json()
    assert r["pushed_updated"] == 1 and r["pulled_updated"] == 1 and r["pulled_deleted"] == 1
    assert dav.summaries() == ["Из LIFE OS (изм.)", "Стоматолог 15:00"]
    titles = [o["title"] for o in _events(client)]
    assert "Йога" not in titles and "Стоматолог 15:00" in titles

    # local deletion -> deleted on the server; a second sync is a no-op
    client.delete(f"/api/v1/calendar/events/{local['id']}")
    r = client.post("/api/v1/integrations/caldav/sync").json()
    assert r["pushed_deleted"] == 1 and dav.summaries() == ["Стоматолог 15:00"]
    assert sum(client.post("/api/v1/integrations/caldav/sync").json().values()) == 0

    st = client.get("/api/v1/integrations").json()["caldav"]
    assert st["connected"] and st["calendar_name"] == "Домашний" and st["last_error"] is None


def test_caldav_bad_login_is_not_saved(client, monkeypatch):
    class Broken(FakeDAV):
        def fetch(self, *a):
            raise CalDAVError("Неверный логин или пароль приложения")

    monkeypatch.setattr(cs, "CalDAVClient", lambda *a, **k: Broken())
    monkeypatch.setattr(settings, "caldav_allow_private_hosts", True)
    r = client.post("/api/v1/integrations/caldav", json={
        "server_url": "https://caldav.example.com/", "username": "me", "password": "x",
        "calendar_url": "https://caldav.example.com/cal/"})
    assert r.status_code == 400 and "пароль" in r.json()["detail"]
    assert client.get("/api/v1/integrations").json()["caldav"]["connected"] is False


def test_caldav_ssrf_guard():
    for url in ("http://caldav.icloud.com/", "https://127.0.0.1/", "https://10.0.0.5/dav", "https://localhost/",
                "ftp://x/", "https://169.254.169.254/latest"):
        with pytest.raises(CalDAVError):
            check_url(url)


def test_caldav_password_is_encrypted_and_isolated(client, other, dav):
    _connect_caldav(client, dav)
    from app.core.db import SessionLocal
    from app.models import ConnectedAccount

    with SessionLocal() as db:
        acc = db.query(ConnectedAccount).one()
        assert "abcd-efgh" not in acc.access_token_enc and cs.decrypt(acc.access_token_enc) == "abcd-efgh"
    assert other.get("/api/v1/integrations").json()["caldav"]["connected"] is False
    assert other.post("/api/v1/integrations/caldav/sync").status_code == 404
    assert not [o for o in _events(other)]


# ================================================================ Google Calendar

class FakeGoogle:
    def __init__(self):
        self.items, self.n = {}, 0

    def add(self, title, start, end, **extra):
        self.n += 1
        gid = f"g{self.n}"
        self.items[gid] = {"id": gid, "status": "confirmed", "summary": title,
                           "start": {"dateTime": start.isoformat(), "timeZone": "UTC"},
                           "end": {"dateTime": end.isoformat()}, "updated": datetime.now(UTC).isoformat(), **extra}
        return gid

    def call(self, method, url, token, **kw):
        gid = url.rsplit("/", 1)[-1] if not url.endswith("/events") else None
        req = httpx.Request(method, url)
        if method == "GET":
            return httpx.Response(200, json={"items": list(self.items.values())}, request=req)
        if method == "POST":
            body = kw["json"]
            new = self.add(body["summary"], datetime.fromisoformat(body["start"]["dateTime"]),
                           datetime.fromisoformat(body["end"]["dateTime"]))
            self.items[new].update(body)
            return httpx.Response(200, json=self.items[new], request=req)
        if gid not in self.items:
            return httpx.Response(404, request=req)
        if method == "PATCH":
            self.items[gid].update(kw["json"], updated=datetime.now(UTC).isoformat())
            return httpx.Response(200, json=self.items[gid], request=req)
        if method == "DELETE":
            self.items[gid]["status"] = "cancelled"
            return httpx.Response(204, request=req)
        raise AssertionError(method)


def test_google_two_way_sync(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "cid")
    monkeypatch.setattr(settings, "google_client_secret", "secret")
    g = FakeGoogle()
    monkeypatch.setattr(cs, "_google_call", g.call)
    monkeypatch.setattr(cs, "google_access_token", lambda acc: "tok")
    from app.core.db import SessionLocal
    from app.models import ConnectedAccount, User

    with SessionLocal() as db:
        uid = db.query(User).one().id
        db.add(ConnectedAccount(user_id=uid, provider="google", access_token_enc=cs.encrypt("tok"), meta={}))
        db.commit()

    s, e = _when()
    g.add("Встреча в Google", s, e, recurrence=["RRULE:FREQ=DAILY;COUNT=2"])
    g.add("Отменено", s, e, status="cancelled")
    g.add("Исключение серии", s, e, recurringEventId="g1")
    local = client.post("/api/v1/calendar/events", json={
        "title": "План из LIFE OS", "starts_at": (s + timedelta(days=1)).isoformat(),
        "ends_at": (e + timedelta(days=1)).isoformat(), "timezone": "Asia/Almaty"}).json()

    r = client.post("/api/v1/integrations/google/sync").json()
    assert r["pulled_created"] == 1 and r["pushed_created"] == 1
    pushed = next(i for i in g.items.values() if i["summary"] == "План из LIFE OS")
    assert pushed["start"]["timeZone"] == "Asia/Almaty"
    assert [o["title"] for o in _events(client)].count("Встреча в Google") == 2

    client.patch(f"/api/v1/calendar/events/{local['id']}", json={"title": "План (изм.)"})
    g.items["g1"].update(summary="Встреча перенесена", updated=(datetime.now(UTC) + timedelta(seconds=5)).isoformat())
    r = client.post("/api/v1/integrations/google/sync").json()
    assert r["pushed_updated"] == 1 and r["pulled_updated"] == 1
    assert pushed["summary"] == "План (изм.)"

    g.items["g1"]["status"] = "cancelled"
    client.delete(f"/api/v1/calendar/events/{local['id']}")
    r = client.post("/api/v1/integrations/google/sync").json()
    assert r["pulled_deleted"] == 1 and r["pushed_deleted"] == 1
    assert pushed["status"] == "cancelled" and _events(client) == []


def test_google_not_configured(client):
    assert client.get("/api/v1/integrations/google/connect").status_code == 503
    assert client.get("/api/v1/integrations").json()["google"]["configured"] is False


# ================================================================ Gemini

def test_gemini_provider(monkeypatch):
    monkeypatch.setattr(settings, "ai_provider", "auto")
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "gemini_api_key", "AQ.test")
    assert ai_mod.provider_name() == "gemini" and ai_mod.is_configured()
    calls = []

    def fake_post(url, json=None, headers=None, timeout=None):
        calls.append((url, json, headers))
        req = httpx.Request("POST", url)
        if "generativelanguage" in url:  # this key only works on Vertex -> fallback
            return httpx.Response(403, json={"error": {"message": "API_KEY_INVALID"}}, request=req)
        return httpx.Response(200, request=req, json={"candidates": [{"content": {"parts": [
            {"text": "Готово. "}, {"functionCall": {"name": "create_task", "args": {"title": "Купить молоко"}}}]}}]})

    monkeypatch.setattr(ai_mod.httpx, "post", fake_post)
    res = ai_mod.get_provider().complete("sys", [{"role": "user", "content": "hi"},
                                                {"role": "assistant", "content": "a"}])
    assert res.text == "Готово. " and res.tool_calls == [{"name": "create_task", "arguments": {"title": "Купить молоко"}}]
    assert len(calls) == 2 and "aiplatform" in calls[1][0]
    url, body, headers = calls[0]
    assert "AQ.test" not in url and headers["x-goog-api-key"] == "AQ.test"
    assert [c["role"] for c in body["contents"]] == ["user", "model"]
    params = body["tools"][0]["functionDeclarations"][0]["parameters"]
    assert "minimum" not in params["properties"]["priority"]


def test_gemini_error_is_reported(monkeypatch):
    monkeypatch.setattr(settings, "ai_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "k")
    monkeypatch.setattr(ai_mod.httpx, "post", lambda url, **kw: httpx.Response(
        429, json={"error": {"message": "quota"}}, request=httpx.Request("POST", url)))
    with pytest.raises(ai_mod.AIProviderError, match="429"):
        ai_mod.get_provider().complete("s", [{"role": "user", "content": "x"}])



def test_gemini_overload_falls_back_to_stable_model(monkeypatch):
    monkeypatch.setattr(settings, "ai_provider", "gemini")
    monkeypatch.setattr(settings, "gemini_api_key", "k")
    monkeypatch.setattr(settings, "gemini_model", "gemini-flash-latest")
    urls = []

    def fake_post(url, **kw):
        urls.append(url)
        req = httpx.Request("POST", url)
        if "gemini-flash-latest" in url:
            return httpx.Response(503, json={"error": {"message": "high demand"}}, request=req)
        return httpx.Response(200, request=req, json={"candidates": [{"content": {"parts": [{"text": "ok"}]}}]})

    monkeypatch.setattr(ai_mod.httpx, "post", fake_post)
    assert ai_mod.get_provider().complete("s", [{"role": "user", "content": "x"}]).text == "ok"
    assert "gemini-2.5-flash" in urls[-1]

# ================================================================ Notes import

def _zip(files: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


def test_import_google_keep_takeout(client, other):
    keep = {"title": "Покупки", "isPinned": True, "isArchived": False, "isTrashed": False,
            "listContent": [{"text": "Молоко", "isChecked": True}, {"text": "Хлеб", "isChecked": False}],
            "labels": [{"name": "дом"}], "userEditedTimestampUsec": 1764000000000000}
    text = {"title": "", "textContent": "Идея: [[Покупки]] и бег", "isTrashed": False}
    trashed = {"title": "Удалённая", "textContent": "x", "isTrashed": True}
    archive = _zip({"Takeout/Keep/Покупки.json": json.dumps(keep), "Takeout/Keep/Покупки.html": "<html>dup</html>",
                    "Takeout/Keep/idea.json": json.dumps(text), "Takeout/Keep/trash.json": json.dumps(trashed),
                    "Takeout/Keep/photo.png": b"\x89PNG"})
    r = client.post("/api/v1/notes/import", files=[("files", ("takeout.zip", archive, "application/zip"))],
                    data={"source": "keep"})
    assert r.status_code == 200, r.text
    assert r.json() == {"imported": 2, "duplicates": 0, "unsupported_files": 1}
    notes = {n["title"]: n for n in client.get("/api/v1/notes").json()["items"]}
    assert notes["Покупки"]["content"] == "- [x] Молоко\n- [ ] Хлеб"
    assert notes["Покупки"]["is_favorite"] and notes["Покупки"]["tags"] == ["дом"]
    assert "Идея: [[Покупки]] и бег" in notes
    links = client.get(f"/api/v1/notes/{notes['Идея: [[Покупки]] и бег']['id']}/backlinks").json()["links"]
    assert [x["title"] for x in links] == ["Покупки"]
    # re-import does not duplicate; other user sees nothing
    again = client.post("/api/v1/notes/import", files=[("files", ("takeout.zip", archive, "application/zip"))]).json()
    assert again["imported"] == 0 and again["duplicates"] == 2
    assert other.get("/api/v1/notes").json()["items"] == []


def test_import_apple_notes(client):
    html = ("<!doctype html><html><head><meta charset='utf-8'><title>Рецепт</title></head><body>"
            "<div><h1>Рецепт</h1></div><div><b>Тесто</b>: мука, <i>вода</i></div><ul><li>Шаг 1</li><li>Шаг 2</li>"
            "</ul><div><a href='https://example.com'>ссылка</a></div><script>alert(1)</script></body></html>")
    md = "# Мысли\n\nСегодня **хороший** день"
    r = client.post("/api/v1/notes/import", files=[
        ("files", ("export.zip", _zip({"Заметки/Рецепт.html": html}), "application/zip")),
        ("files", ("Мысли.md", md.encode(), "text/markdown")),
        ("files", ("todo.txt", "купить билеты".encode(), "text/plain"))])
    assert r.json()["imported"] == 3, r.text
    notes = {n["title"]: n for n in client.get("/api/v1/notes").json()["items"]}
    rec = notes["Рецепт"]["content"]
    assert rec.startswith("**Тесто**: мука, *вода*") and "- Шаг 1\n- Шаг 2" in rec
    assert "[ссылка](https://example.com)" in rec and "alert" not in rec
    assert notes["Мысли"]["content"] == "Сегодня **хороший** день"
    assert notes["todo"]["content"] == "купить билеты"
    folders = {f["name"] for f in client.get("/api/v1/folders").json()["items"]}
    assert {"Apple Notes", "Заметки"} <= folders


def test_import_rejects_garbage(client):
    r = client.post("/api/v1/notes/import", files=[("files", ("a.png", b"\x89PNG", "image/png"))])
    assert r.status_code == 422
    r = client.post("/api/v1/notes/import", files=[("files", ("bad.zip", b"not a zip", "application/zip"))])
    assert r.status_code == 422

