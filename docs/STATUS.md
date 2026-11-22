# STATUS.md — acceptance criteria and known limitations

Verified on 2026-11-22 in a Linux workspace with PostgreSQL 16.15, Redis, Python 3.13, Node 22, Google Chrome.

## Test results (actually executed)
| Suite | Result |
|---|---|
| Backend pytest (real PostgreSQL, schema built by Alembic) | **42 passed** |
| Alembic `upgrade` → `downgrade base` → `upgrade` round trip, `alembic check` | OK, models in sync |
| Ruff (pyflakes + syntax) | clean |
| Frontend TypeScript strict | clean |
| Vitest | **8 passed** |
| `next build` (production) | OK, 42 routes |
| Playwright E2E in Chrome against the running stack (API + scheduler + Next) | **12 passed**, all 30 sections open with no runtime/console errors or 5xx |

## Acceptance criteria (section 36)
| Criterion | Status |
|---|---|
| User can register / log in | ✅ tests + E2E |
| Data stored in PostgreSQL | ✅ |
| User sees only own data | ✅ `test_isolation.py` |
| Main CRUD works | ✅ |
| Goals linked to milestones and tasks | ✅ |
| Habits keep history | ✅ |
| Calendar shows real events | ✅ (incl. recurring, DST) |
| Reminders scheduled and delivered | ✅ in-app + browser channel verified; email / Web Push implemented, need SMTP / VAPID keys to deliver |
| Learning Center saves progress | ✅ |
| Flashcards support repetition | ✅ SM-2 |
| Books track reading progress | ✅ |
| Journal saves entries | ✅ |
| Focus timer saves sessions | ✅ (server-side state + heartbeat autosave) |
| Finance saves transactions | ✅ |
| Analytics computes real metrics | ✅ documented formulas, `null` when no data |
| XP not awarded twice | ✅ |
| AI uses allowed context | ✅ verified with a test provider; real LLM calls need an API key |
| Settings persist | ✅ |
| Responsive UI | ✅ checked at 390 px and 1440 px |
| PWA works in supported browsers | ⚠️ manifest, icons, service worker, install prompt, offline page and offline write queue are implemented and build; the service worker and install flow were **not** exercised by automated tests |
| Main tests pass | ✅ |
| Documentation created | ✅ |
| App starts by the instructions | ✅ local (non-Docker) instructions verified. ⚠️ `docker compose config` validated, but images could not be built here because Docker Hub is blocked in this workspace — run `docker compose up --build` once on your machine |

## Known limitations (honest list)
- **External integrations need your keys**: SMTP, Web Push (VAPID), AI provider, Google OAuth/Calendar. Without keys they show a clear "not configured" state; they were not tested against the real services. Check that `ANTHROPIC_MODEL` matches a model available to your account.
- **Google Calendar** is a one-way import (read-only scope), not two-way sync. Google *login* (OAuth sign-in) is not implemented; the connection flow links a calendar to an existing account.
- **Offline**: private data is deliberately not cached, so pages need the network to read data; writes made offline are queued and replayed (server wins on conflict). Not covered by automated tests.
- **Translations**: Kazakh and English cover navigation, common UI, auth and dashboard labels; many inner-page strings are Russian only (they fall back to ru).
- **Notes editor** is Markdown with live preview (not a WYSIWYG rich-text editor).
- **Drag and drop**: Kanban columns and calendar (non-recurring events). Dashboard widgets are reordered with up/down buttons, not dragging.
- **Social**: friends, requests, blocking, groups, group challenges with leaderboard, shared goals, public achievements. Not implemented: shared learning plans and dedicated "team habits" (use group challenges with the `habit_checks` metric).
- **Currencies**: per-transaction currency and a main currency; no exchange-rate conversion (other currencies are reported separately).
- **Health**: tracking only, no medical advice or diagnoses by design.
- No full accessibility audit or load testing was performed.
