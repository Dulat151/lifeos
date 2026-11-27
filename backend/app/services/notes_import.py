"""Import notes from Google Keep (Google Takeout) and Apple Notes (exported Markdown / HTML / text).

Neither service has a public API for personal accounts (the Google Keep API is limited to Google Workspace
domains; Apple Notes has no web API), so notes arrive as files:
  * Google Keep: takeout.google.com -> only "Keep" -> .zip with Takeout/Keep/*.json (+ duplicate *.html)
  * Apple Notes: File -> Export as Markdown on macOS 26+, or scripts/export-apple-notes.sh (all notes as HTML)
Accepted uploads: .zip (any mix of the formats below), .json (Keep), .md / .markdown, .txt, .html / .htm.
Re-importing the same files does not create duplicates (same title + content are skipped).
"""
import io
import json
import re
import zipfile
from dataclasses import dataclass, field
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import PurePosixPath

from sqlalchemy import select

from app.models import Folder, Note

MAX_FILES = 5000
MAX_TOTAL_BYTES = 100 * 1024 * 1024  # uncompressed, protects against zip bombs
TEXT_EXT = {".md", ".markdown", ".txt"}
HTML_EXT = {".html", ".htm"}


class NotesImportError(ValueError):
    pass


@dataclass
class ParsedNote:
    title: str
    content: str
    tags: list[str] = field(default_factory=list)
    archived: bool = False
    favorite: bool = False
    source: str = "apple"  # keep | apple
    folder: str | None = None
    edited_at: datetime | None = None
    trashed: bool = False


# ---------------------------------------------------------------- HTML -> Markdown

class _MD(HTMLParser):

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.lists: list[str] = []
        self.href: list[str | None] = []
        self.skip = 0
        self.title: str | None = None
        self._in_title = False

    def _nl(self, n=1):
        text = "".join(self.out)
        trailing = len(text) - len(text.rstrip("\n"))
        if text and trailing < n:
            self.out.append("\n" * (n - trailing))

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style"):
            self.skip += 1
        if tag == "title":
            self._in_title = True
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._nl(2)
            self.out.append("#" * int(tag[1]) + " ")
        elif tag in ("p", "div", "blockquote", "table"):
            self._nl(1)
        elif tag == "br":
            self.out.append("\n")
        elif tag in ("ul", "ol"):
            self._nl(1)
            self.lists.append(tag)
        elif tag == "li":
            self._nl(1)
            depth = max(0, len(self.lists) - 1)
            self.out.append("  " * depth + ("1. " if self.lists and self.lists[-1] == "ol" else "- "))
        elif tag in ("b", "strong"):
            self.out.append("**")
        elif tag in ("i", "em"):
            self.out.append("*")
        elif tag in ("s", "strike", "del"):
            self.out.append("~~")
        elif tag == "a":
            self.href.append(a.get("href"))
            self.out.append("[")
        elif tag == "input" and a.get("type") == "checkbox":
            self.out.append("[x] " if "checked" in a else "[ ] ")
        elif tag == "img" and a.get("alt"):
            self.out.append(f"[{a['alt']}]")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
        if tag == "title":
            self._in_title = False
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6") or tag in ("p", "blockquote", "table"):
            self._nl(2)
        elif tag in ("div", "tr"):
            self._nl(1)
        elif tag in ("ul", "ol"):
            if self.lists:
                self.lists.pop()
            self._nl(2 if not self.lists else 1)
        elif tag in ("b", "strong"):
            self.out.append("**")
        elif tag in ("i", "em"):
            self.out.append("*")
        elif tag in ("s", "strike", "del"):
            self.out.append("~~")
        elif tag == "a":
            href = self.href.pop() if self.href else None
            self.out.append(f"]({href})" if href and not href.startswith("javascript:") else "]")

    def handle_data(self, data):
        if self._in_title:
            self.title = (self.title or "") + data
            return
        if self.skip:
            return
        self.out.append(re.sub(r"\s+", " ", data) if "\n" in data else data)


def html_to_markdown(html: str) -> tuple[str | None, str]:
    p = _MD()
    p.feed(html)
    p.close()
    text = "".join(p.out)
    text = re.sub(r"\*\*\s*\*\*", "", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return (p.title.strip() if p.title else None), text


# ---------------------------------------------------------------- per-format parsers

def _first_line_title(text: str, fallback: str) -> tuple[str, str]:
    lines = text.strip().splitlines()
    if not lines:
        return fallback, ""
    first = lines[0].strip()
    if first.startswith("#"):
        return first.lstrip("#").strip() or fallback, "\n".join(lines[1:]).strip()
    return fallback, text.strip()


def parse_keep_json(raw: bytes) -> ParsedNote | None:
    try:
        d = json.loads(raw.decode("utf-8-sig"))
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(d, dict) or not ("textContent" in d or "listContent" in d or "title" in d):
        return None
    if d.get("isTrashed"):
        return ParsedNote(title="", content="", source="keep", trashed=True)
    parts = []
    if d.get("textContent"):
        parts.append(d["textContent"].strip())
    if d.get("listContent"):
        parts.append("\n".join(f"- [{'x' if i.get('isChecked') else ' '}] {i.get('text', '').strip()}"
                               for i in d["listContent"]))
    for an in d.get("annotations") or []:
        if an.get("url"):
            parts.append(f"[{an.get('title') or an['url']}]({an['url']})")
    content = "\n\n".join(p for p in parts if p)
    ts = d.get("userEditedTimestampUsec") or d.get("createdTimestampUsec")
    title = (d.get("title") or "").strip() or (content.splitlines()[0][:80] if content else "Без названия")
    return ParsedNote(title=title, content=content, source="keep", archived=bool(d.get("isArchived")),
                      favorite=bool(d.get("isPinned")), tags=[lb["name"] for lb in d.get("labels") or [] if lb.get("name")],
                      edited_at=datetime.fromtimestamp(int(ts) / 1e6, UTC) if ts else None)


def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-16", "cp1251"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def parse_file(name: str, raw: bytes, source_hint: str = "auto") -> ParsedNote | None:
    path = PurePosixPath(name)
    ext, stem = path.suffix.lower(), path.stem
    folder = path.parent.name if path.parent.name not in ("", ".", "Keep", "Takeout") else None
    is_keep = source_hint == "keep" or "Keep" in path.parts
    if ext == ".json":
        n = parse_keep_json(raw)
        return n
    if ext in HTML_EXT:
        title, md = html_to_markdown(_decode(raw))
        lines = md.splitlines()
        first = lines[0].lstrip("#").strip() if lines else ""
        title = (title or "").strip() or first[:300] or stem
        if first and first == title:  # Apple Notes repeats the title as the first line / heading
            md = "\n".join(lines[1:]).strip()
        return ParsedNote(title=title, content=md, source="keep" if is_keep else "apple", folder=folder)
    if ext in TEXT_EXT:
        title, body = _first_line_title(_decode(raw), stem)
        return ParsedNote(title=title, content=body, source="keep" if is_keep else "apple", folder=folder)
    return None


def collect(files: list[tuple[str, bytes]], source_hint: str = "auto") -> tuple[list[ParsedNote], int]:
    """Expands zips; for Keep, *.html duplicates of *.json are ignored. Returns (notes, unsupported_count)."""
    entries: list[tuple[str, bytes]] = []
    total = 0
    for name, raw in files:
        if name.lower().endswith(".zip"):
            try:
                zf = zipfile.ZipFile(io.BytesIO(raw))
            except zipfile.BadZipFile:
                raise NotesImportError(f"Файл {name} не является ZIP-архивом") from None
            for info in zf.infolist():
                if info.is_dir() or "__MACOSX" in info.filename or PurePosixPath(info.filename).name.startswith("."):
                    continue
                total += info.file_size
                if total > MAX_TOTAL_BYTES or len(entries) >= MAX_FILES:
                    raise NotesImportError("Архив слишком большой (максимум 100 МБ и 5000 файлов)")
                entries.append((info.filename, zf.read(info)))
        else:
            entries.append((name, raw))
    json_stems = {str(PurePosixPath(n).with_suffix("")) for n, _ in entries if n.lower().endswith(".json")}
    notes, unsupported = [], 0
    for name, raw in entries:
        p = PurePosixPath(name)
        if p.suffix.lower() in HTML_EXT and str(p.with_suffix("")) in json_stems:
            continue
        n = parse_file(name, raw, source_hint)
        if n is None:
            unsupported += 1
        elif not n.trashed and (n.title or n.content):
            notes.append(n)
    return notes, unsupported


# ---------------------------------------------------------------- persistence

def _folder(db, user, cache: dict, name: str, parent_id=None):
    key = (name, parent_id)
    if key not in cache:
        f = db.scalar(select(Folder).where(Folder.user_id == user.id, Folder.name == name,
                                           Folder.parent_id.is_(None) if parent_id is None
                                           else Folder.parent_id == parent_id))
        if not f:
            f = Folder(user_id=user.id, name=name, parent_id=parent_id)
            db.add(f)
            db.flush()
        cache[key] = f.id
    return cache[key]


def save(db, user, notes: list[ParsedNote], after_save=None) -> dict:
    cache: dict = {}
    existing = {(t.lower(), c) for t, c in db.execute(select(Note.title, Note.content).where(
        Note.user_id == user.id, Note.deleted_at.is_(None)))}
    imported = duplicates = 0
    for n in notes:
        title = (n.title or "Без названия")[:300]
        if (title.lower(), n.content) in existing:
            duplicates += 1
            continue
        root = _folder(db, user, cache, "Google Keep" if n.source == "keep" else "Apple Notes")
        folder_id = _folder(db, user, cache, n.folder[:120], root) if n.folder else root
        note = Note(user_id=user.id, title=title, content=n.content, folder_id=folder_id,
                    tags=[t[:40] for t in n.tags][:20], archived=n.archived, is_favorite=n.favorite,
                    category="imported")
        db.add(note)
        db.flush()
        if after_save:
            after_save(note)
        existing.add((title.lower(), n.content))
        imported += 1
    return {"imported": imported, "duplicates": duplicates}
