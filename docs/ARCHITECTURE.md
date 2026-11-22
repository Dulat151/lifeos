# ARCHITECTURE.md

## Overview

```
Browser (PWA, service worker)
   │  same-origin /api/*  (httpOnly cookies + CSRF header)
   ▼
Next.js (web)  ── rewrites /api/* ──►  FastAPI (api)  ──►  PostgreSQL
                                            │                ▲
                                            ▼                │
                                          Redis ◄── Celery worker / beat (reminders, recurring payments)
```

The browser talks only to the web origin. Next.js proxies `/api/*` to FastAPI, which keeps auth cookies first-party
(`SameSite=Lax`, `httpOnly`) and lets the frontend read the CSRF cookie for the double-submit header.

## Backend layout (`backend/app`)

| Path | Responsibility |
|---|---|
| `core/config.py` | Settings from environment (`.env`) |
| `core/db.py` | Engine, session, declarative base |
| `core/security.py` | Argon2id password hashing, JWT access tokens, hashed opaque refresh/one-time tokens |
| `core/deps.py` | `CurrentUser` (cookie or bearer, CSRF check, session revocation), `get_owned`, `ensure_refs_owned` |
| `core/ratelimit.py` | Fixed-window limiter (Redis, in-memory fallback) |
| `models/` | SQLAlchemy models (core, planner, learning, life, engagement) |
| `schemas/` | Pydantic request/response models; PATCH schemas derived from create schemas (`make_update`) |
| `api/crud.py` | One generic owned-resource CRUD router (list/search/filter/paginate, create, get, patch, soft/hard delete, FK ownership checks, hooks) |
| `api/v1/*.py` | Routers per domain; custom logic where CRUD is not enough |
| `services/` | Domain logic: gamification, SM-2, habit stats, recurrence (RRULE+DST), reminders engine, analytics, AI, finance |
| `workers/` | Celery app + tasks, standalone scheduler |

Business rules live in services and are reused by every caller (API routes, AI tool execution, background jobs),
e.g. AI "create task" calls the same `create_task` route function after user confirmation.

## Frontend layout (`frontend/src`)

| Path | Responsibility |
|---|---|
| `app/(auth)/*` | login, register, forgot/reset password, verify email |
| `app/(app)/*` | 30 sections, each its own route; dynamic detail pages for goals, notes, courses, subjects, social profiles |
| `components/ui` | Design-system primitives (Button, Input, Card, Dialog, Tabs, Badge, Progress, Skeleton, Empty/Error states, Toasts) |
| `components/entity.tsx` | Config-driven form (RHF + Zod) and list used by simple CRUD modules |
| `components/charts.tsx` | Themed Recharts wrappers, heatmap |
| `components/layout` | App shell: sidebar, header, global search, notifications, quick actions, PWA install, error boundary |
| `hooks/use-api.ts` | TanStack Query wrappers with toasts and cross-module cache invalidation |
| `lib/api.ts` | Fetch client: CSRF header, silent refresh on 401, error normalisation |
| `lib/i18n.ts` | ru / kk / en dictionaries (ru fallback) |
| `public/sw.js` | Service worker: static cache, offline fallback, offline write queue, push |

## Key algorithms (documented formulas)

### Goal progress
- With milestones: mean of milestone progress; a milestone is 100 % when completed, otherwise `done/total` of its top-level non-cancelled tasks.
- Without milestones but with linked tasks: `done/total`.
- Otherwise measurable metric: `min(current/target, 1)`. Completed goals = 100 %.

### Habits
- One `habit_logs` row per habit per local day (unique). Boolean habits can't be completed twice a day; numeric/duration
  habits accumulate only when `allow_multiple_per_day`.
- `skipped` days are neutral: they don't break streaks and are excluded from completion rate.
- Daily / selected-days / every-N-days are evaluated per scheduled day; weekly / monthly per period (`times_per_period`).
  The current unfinished day/period never breaks a streak.

### Spaced repetition (SM-2)
`EF' = max(1.3, EF + 0.1 − (5−q)(0.08 + (5−q)·0.02))`; `q<3` → repetitions=0, interval=1, lapse+1; otherwise interval 1, 6,
then `round(prev·EF')`. Every review is stored in `flashcard_reviews`. Stages: new (never reviewed), learning (<2 reps),
review, mastered (interval ≥ 21 days). New cards per day are limited per deck.

### XP & levels
- Rules (`services/gamification.py::XP_RULES`): task 10, habit check 5, goal 100, milestone 25, focus session 15,
  learning session 10, flashcard review 1 (per card per day), journal entry 5 (per kind per day), book 50, workout 15.
- Idempotency: unique `(user_id, idempotency_key)`. Undoing an action writes one compensating `correction` row;
  re-doing it grants again with a new key — net XP for a source never exceeds one award.
- `XP(level L) = 50·(L−1)·L` → L2 = 100, L3 = 300, L4 = 600.
- Achievements: conditions `{metric, gte}` over real counts, checked after each award; unlock grants a one-time reward.

### Analytics (`services/analytics.py`)
- task completion rate = done / tasks due or completed in the period (top-level, non-template, non-cancelled)
- habit completion rate = successful scheduled habit-days / evaluated habit-days (skips excluded)
- productivity score = 0.4·tasks + 0.4·habits + 0.2·min(focus min per day / 120, 1)·100, missing components excluded and weights renormalised; `null` when there is no data
- comparison: the previous period of equal length. No number is ever synthesised.

### Reminder engine
- `dispatch_due()` locks due reminders (`FOR UPDATE SKIP LOCKED`), creates one notification per occurrence
  (unique `dedup_key = reminder id + occurrence time`) and one delivery per channel, then advances `next_fire_at`
  with the RRULE expanded in the reminder's IANA time zone (DST-safe). Missed occurrences older than 10 minutes are not replayed.
- `process_deliveries()` sends pending deliveries; failures retry with backoff 1, 2, 4, 8 min (max 5 attempts).
  Unconfigured channels (no SMTP / VAPID) fail with an explicit reason, never a fake success.
- Quiet hours postpone email and Web Push to the end of the window; in-app notifications are stored immediately.
- Channel `browser` is delivered by the open app (Notification API) and marked sent when fetched.
- Event reminders, habit `reminder_time` and custom reminders all use the same engine.

### Recurrence
Tasks, events and reminders store RFC 5545 RRULE strings. Completing a recurring task spawns the next instance.
Calendar ranges expand recurring events server-side for the requested window.

### AI assistant
Server-side only. Context is built from modules the user allowed (`settings.ai_context`; journal, finance, health off by default).
The model can only *propose* actions via tools; proposals are stored in `ai_tool_actions(status=pending)` and executed
through the normal validated code paths only after the user clicks "Confirm". Unknown tools are dropped. Provider errors map to 502,
missing key to 503, per-user rate limit to 429.

## Cross-module links
Goal → milestones → tasks; goal ↔ habits, calendar events, notes, courses, vision board items, shared goals.
Focus sessions → task actual time and learning sessions. Book/goal/milestone completion → life timeline. Everything → XP, achievements, challenges, analytics, dashboard.
