"""Minimal CalDAV client (RFC 4791) for iCloud and other servers (Fastmail, Nextcloud, Yandex...).

Only what two-way event sync needs: principal/calendar discovery, time-range REPORT, PUT and DELETE.
Every request URL (including redirects) is checked so a user-supplied server address cannot reach
private or loopback networks (SSRF), unless CALDAV_ALLOW_PRIVATE_HOSTS is enabled for local testing.
"""
import ipaddress
import socket
import xml.etree.ElementTree as ET
from datetime import UTC, datetime

import httpx

from app.core.config import settings

ICLOUD_URL = "https://caldav.icloud.com/"
NS = {"d": "DAV:", "c": "urn:ietf:params:xml:ns:caldav", "ic": "http://apple.com/ns/ical/"}
MAX_REDIRECTS = 5


class CalDAVError(RuntimeError):
    pass


def check_url(url: str) -> httpx.URL:
    try:
        u = httpx.URL(url)
    except Exception:  # noqa: BLE001
        raise CalDAVError("Некорректный адрес сервера CalDAV") from None
    if u.scheme not in ("http", "https") or not u.host:
        raise CalDAVError("Адрес сервера должен начинаться с https://")
    if settings.caldav_allow_private_hosts:
        return u
    if u.scheme != "https":
        raise CalDAVError("Адрес сервера должен начинаться с https://")
    try:
        infos = socket.getaddrinfo(u.host, u.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise CalDAVError(f"Сервер {u.host} не найден") from None
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise CalDAVError("Этот адрес сервера CalDAV запрещён")
    return u


def _propfind(*props: str) -> bytes:
    inner = "".join(f"<{p}/>" for p in props)
    return (f'<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" '
            f'xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:ic="http://apple.com/ns/ical/">'
            f"<d:prop>{inner}</d:prop></d:propfind>").encode()


def _ical_utc(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


class CalDAVClient:
    def __init__(self, username: str, password: str, transport: httpx.BaseTransport | None = None):
        self.http = httpx.Client(auth=(username, password), timeout=30, follow_redirects=False,
                                 headers={"User-Agent": "LIFE-OS/1.0"}, transport=transport)

    def close(self):
        self.http.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def request(self, method: str, url: str, body: bytes | None = None, depth: str | None = None,
                headers: dict | None = None, ok=(200, 201, 204, 207)) -> tuple[httpx.Response, str]:
        h = dict(headers or {})
        if depth is not None:
            h["Depth"] = depth
        if body is not None and "Content-Type" not in h:
            h["Content-Type"] = "application/xml; charset=utf-8"
        for _ in range(MAX_REDIRECTS):
            check_url(url)
            try:
                r = self.http.request(method, url, content=body, headers=h)
            except httpx.HTTPError as e:
                raise CalDAVError(f"Сервер CalDAV недоступен: {e.__class__.__name__}") from e
            if r.status_code in (301, 302, 307, 308) and r.headers.get("location"):
                url = str(httpx.URL(url).join(r.headers["location"]))
                continue
            break
        else:
            raise CalDAVError("Слишком много перенаправлений")
        if r.status_code == 401:
            raise CalDAVError("Неверный логин или пароль приложения")
        if r.status_code not in ok:
            raise CalDAVError(f"Сервер CalDAV ответил {r.status_code}")
        return r, url

    # ---------------------------------------------------------------- parsing helpers
    @staticmethod
    def _responses(r: httpx.Response, base: str):
        try:
            root = ET.fromstring(r.content)
        except ET.ParseError:
            raise CalDAVError("Сервер вернул некорректный ответ") from None
        for resp in root.findall("d:response", NS):
            href = resp.findtext("d:href", default="", namespaces=NS).strip()
            for ps in resp.findall("d:propstat", NS):
                if " 200" not in (ps.findtext("d:status", default="", namespaces=NS) or ""):
                    continue
                prop = ps.find("d:prop", NS)
                if prop is not None:
                    yield str(httpx.URL(base).join(href)), prop

    def _href_prop(self, url: str, prop: str, tag: str) -> str | None:
        r, final = self.request("PROPFIND", url, _propfind(prop), depth="0")
        for _, p in self._responses(r, final):
            href = p.findtext(f"{tag}/d:href", namespaces=NS)
            if href:
                return str(httpx.URL(final).join(href.strip()))
        return None

    # ---------------------------------------------------------------- API
    def discover(self, url: str) -> list[dict]:
        """Calendars that can hold events: [{url, name, color}]."""
        principal = self._href_prop(url, "d:current-user-principal", "d:current-user-principal")
        if not principal:
            principal = self._href_prop(str(httpx.URL(url).join("/.well-known/caldav")), "d:current-user-principal",
                                        "d:current-user-principal")
        if not principal:
            raise CalDAVError("Сервер не сообщил адрес учётной записи (current-user-principal)")
        home = self._href_prop(principal, "c:calendar-home-set", "c:calendar-home-set")
        if not home:
            raise CalDAVError("Сервер не сообщил адрес календарей (calendar-home-set)")
        r, final = self.request("PROPFIND", home, _propfind(
            "d:resourcetype", "d:displayname", "c:supported-calendar-component-set", "ic:calendar-color"), depth="1")
        out = []
        for href, p in self._responses(r, final):
            if p.find("d:resourcetype/c:calendar", NS) is None:
                continue
            comps = {c.get("name") for c in p.findall("c:supported-calendar-component-set/c:comp", NS)}
            if comps and "VEVENT" not in comps:
                continue
            out.append({"url": href, "name": (p.findtext("d:displayname", namespaces=NS) or "").strip() or "Календарь",
                        "color": (p.findtext("ic:calendar-color", namespaces=NS) or "").strip()[:7] or None})
        return out

    def fetch(self, calendar_url: str, start: datetime, end: datetime) -> list[tuple[str, str, str]]:
        """[(href, etag, ical)] of events overlapping [start, end) (recurring masters included)."""
        body = (f'<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" '
                f'xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop>'
                f'<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">'
                f'<c:time-range start="{_ical_utc(start)}" end="{_ical_utc(end)}"/>'
                f"</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>").encode()
        r, final = self.request("REPORT", calendar_url, body, depth="1")
        out = []
        for href, p in self._responses(r, final):
            data = p.findtext("c:calendar-data", namespaces=NS)
            if data:
                out.append((href, (p.findtext("d:getetag", namespaces=NS) or "").strip(), data))
        return out

    def put(self, href: str, ical: bytes, create: bool = False) -> str | None:
        h = {"Content-Type": "text/calendar; charset=utf-8"}
        if create:
            h["If-None-Match"] = "*"
        r, _ = self.request("PUT", href, ical, headers=h, ok=(200, 201, 204))
        return r.headers.get("etag")

    def delete(self, href: str) -> None:
        self.request("DELETE", href, ok=(200, 204, 404, 410))


__all__ = ["ICLOUD_URL", "CalDAVClient", "CalDAVError", "check_url"]
