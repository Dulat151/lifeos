# TESTING.md

## Backend — pytest against real PostgreSQL (42 tests)
```bash
createdb -O lifeos lifeos_test
cd backend && pytest -q
```
The session fixture recreates the schema **through Alembic migrations** (so migrations are tested too); every test starts
from truncated tables with seeded achievements.

| File | Covers |
|---|---|
| `test_auth.py` | registration, validation, duplicate email, login/logout, CSRF enforcement, bearer tokens, session revocation, refresh rotation, email verification (single use), password reset (no enumeration, revokes sessions), settings/profile persistence and validation, rate limiter |
| `test_core_flows.py` | goal → milestones → tasks progress, goal history, task views/kanban/bulk/history, dependencies + cycle detection, recurring tasks, quick add, subtasks, **XP not awarded twice** (incl. undo/redo), achievements, habit streaks/dedup/future dates, numeric habits, calendar recurrence **across DST**, ICS export/import, reminder engine (dedup, retry, honest SMTP failure, browser channel, snooze), quiet hours, event reminders, habit reminder sync |
| `test_modules.py` | learning sessions & course progress, SM-2 unit tests, flashcard review flow, books progress/stats, journal privacy/search/export, focus state machine, finance report/budgets/multi-currency/savings, subscriptions → transactions, health logs & workouts, notes links & knowledge graph, analytics formulas, dashboard layout & start/end day & search, **AI confirmation flow and context limits** (fake provider), file upload validation, personal tools, challenges, data export, account deletion |
| `test_isolation.py` | cross-account access by ID substitution on every module (read, update, delete, link), unauthenticated access, social privacy & blocking |

## Frontend
```bash
cd frontend
npm run lint      # TypeScript strict type check
npm test          # Vitest: API client (CSRF, errors, offline), utils, i18n, config-driven form validation
npm run build     # production build of all 42 routes
```

## End-to-end (Playwright)
Requires the full stack on `http://localhost:3000`.
```bash
CHROME_PATH=/usr/bin/google-chrome npx playwright test
```
`e2e/main-flows.spec.ts` runs in a real browser: register → dashboard, goal + milestone + task with progress, quick add + Kanban,
habit check persisted after reload, calendar event, journal entry, focus start/pause/resume/finish, finance transaction,
XP history and analytics, honest AI "not configured" state, opening **all 30 sections** with no runtime errors, console errors
or 5xx responses, logout and login.

## Scenario checklist (section 31 of the spec)
| # | Scenario | Where |
|---|---|---|
| 1–2 | registration, login | test_auth, e2e |
| 3–6 | goal, milestone, task, task↔goal | test_core_flows::test_goal_milestone_task_progress, e2e |
| 7–8 | habit create/complete | test_core_flows, e2e |
| 9 | calendar event | test_core_flows::test_calendar_recurring_dst_and_ics, e2e |
| 10 | reminder delivery | test_core_flows::test_reminder_engine_delivery_dedup_retry |
| 11 | study session | test_modules::test_learning_session_and_course_progress |
| 12 | flashcard review | test_modules::test_flashcard_review_flow |
| 13 | journal entry | test_modules, e2e |
| 14 | focus timer | test_modules::test_focus_timer_state_machine, e2e |
| 15 | finance transaction | test_modules::test_finance_report_and_budget, e2e |
| 16 | analytics | test_modules::test_analytics_real_metrics |
| 17 | XP | test_core_flows::test_xp_not_awarded_twice |
| 18 | AI | test_modules::test_ai_requires_confirmation_and_context, e2e |
| 19 | data export | test_modules::test_export_and_account_deletion |
| 20 | account deletion | test_modules::test_export_and_account_deletion |
| — | cross-user security | test_isolation |
