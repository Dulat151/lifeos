# API.md — LIFE OS REST API

Base URL: `/api/v1`. Interactive docs (Swagger UI): `/api/docs`, raw spec: `/api/openapi.json`.

## Conventions

- **Auth**: httpOnly cookie `lifeos_access` (set by `/auth/login`/`/auth/register`) or `Authorization: Bearer <access_token>`.
- **CSRF**: cookie-authenticated `POST/PATCH/PUT/DELETE` must send header `X-CSRF-Token` equal to the `lifeos_csrf` cookie (double submit). Bearer requests are exempt.
- **Ownership**: every resource is scoped to the current user. Foreign IDs return **404** (no existence leak); linking to someone else's object returns **422**.
- **Errors**: `{"detail": "message"}`; validation → `422 {"detail":"Ошибка валидации","errors":[{field,message}]}`; `401` unauthenticated, `403` forbidden/CSRF/feature disabled, `404` not found, `409` conflict (duplicate, cycle, blocked task, already processed), `413` too large, `415` bad file type, `429` rate limited, `502/503` external provider error / not configured.
- **Lists** from the generic CRUD layer return `{items, total, limit, offset}` and accept `q`, `limit`, `offset`, `filters=field:value,...`, `include_archived`.
- **Dates**: `date` = `YYYY-MM-DD` (user's local day); `datetime` must include a UTC offset (ISO 8601). Recurrence uses RFC 5545 RRULE (`FREQ=WEEKLY;BYDAY=MO,WE`).

## Endpoints

### ai

| Method | Path | Request | Success |
|---|---|---|---|
| POST | `/ai/actions/{aid}/confirm` | — | 200 AIActionRead |
| POST | `/ai/actions/{aid}/reject` | — | 200 AIActionRead |
| POST | `/ai/chat` | AIChatIn | 200 |
| GET | `/ai/conversations` | — | 200 AIConversationRead[] |
| DELETE | `/ai/conversations/{cid}` | — | 204 |
| GET | `/ai/conversations/{cid}` | — | 200 |
| GET | `/ai/status` | — | 200 |

### analytics

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/analytics/export.csv` | — | 200 |
| GET | `/analytics/formulas` | — | 200 |
| GET | `/analytics/overview` | — | 200 |

### auth

| Method | Path | Request | Success |
|---|---|---|---|
| POST | `/auth/change-password` | ChangePasswordIn | 200 |
| GET | `/auth/google/status` | — | 200 |
| POST | `/auth/login` | LoginIn | 200 |
| POST | `/auth/logout` | — | 204 |
| POST | `/auth/password-reset/confirm` | ResetIn | 200 |
| POST | `/auth/password-reset/request` | EmailIn | 200 |
| POST | `/auth/refresh` | — | 200 |
| POST | `/auth/register` | RegisterIn | 201 |
| POST | `/auth/resend-verification` | — | 200 |
| GET | `/auth/sessions` | — | 200 SessionRead[] |
| DELETE | `/auth/sessions/{session_id}` | — | 204 |
| POST | `/auth/verify-email` | TokenIn | 200 |

### books

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/books` | — | 200 BookRead[] |
| POST | `/books` | BookCreate | 201 BookRead |
| GET | `/books/stats` | — | 200 |
| DELETE | `/books/{book_id}` | — | 204 |
| GET | `/books/{book_id}` | — | 200 BookRead |
| PATCH | `/books/{book_id}` | BookUpdate | 200 BookRead |
| GET | `/books/{book_id}/notes` | — | 200 BookNoteRead[] |
| POST | `/books/{book_id}/notes` | BookNoteCreate | 201 BookNoteRead |
| DELETE | `/books/{book_id}/notes/{note_id}` | — | 204 |
| GET | `/books/{book_id}/sessions` | — | 200 ReadingSessionRead[] |
| POST | `/books/{book_id}/sessions` | ReadingSessionCreate | 201 ReadingSessionRead |

### calendar

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/calendar/events` | — | 200 EventOccurrence[] |
| POST | `/calendar/events` | EventCreate | 201 EventRead |
| DELETE | `/calendar/events/{event_id}` | — | 204 |
| GET | `/calendar/events/{event_id}` | — | 200 EventRead |
| PATCH | `/calendar/events/{event_id}` | EventUpdate | 200 EventRead |
| GET | `/calendar/events/{event_id}/reminders` | — | 200 |
| GET | `/calendar/export.ics` | — | 200 |
| POST | `/calendar/import.ics` | Body_import_ics_api_v1_calendar_import_ics_post | 200 |

### challenges

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/challenges` | — | 200 ChallengeRead[] |
| POST | `/challenges` | ChallengeCreate | 201 ChallengeRead |
| DELETE | `/challenges/{cid}` | — | 204 |
| GET | `/challenges/{cid}/leaderboard` | — | 200 |

### dashboard

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/dashboard` | — | 200 |
| POST | `/dashboard/end-day` | EndDayIn | 200 |
| PUT | `/dashboard/layout` | LayoutIn | 200 |
| GET | `/dashboard/search` | — | 200 |
| POST | `/dashboard/start-day` | StartDayIn | 200 |

### files

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/files` | — | 200 |
| POST | `/files` | Body_upload_api_v1_files_post | 201 |
| DELETE | `/files/{fid}` | — | 204 |
| GET | `/files/{fid}/download` | — | 200 |

### finance

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/finance/budgets` | — | 200 BudgetRead[] |
| POST | `/finance/budgets` | BudgetCreate | 201 BudgetRead |
| DELETE | `/finance/budgets/{item_id}` | — | 204 |
| GET | `/finance/budgets/{item_id}` | — | 200 BudgetRead |
| PATCH | `/finance/budgets/{item_id}` | BudgetUpdate | 200 BudgetRead |
| GET | `/finance/categories` | — | 200 |
| GET | `/finance/report` | — | 200 |
| GET | `/finance/savings-goals` | — | 200 Page |
| POST | `/finance/savings-goals` | SavingsGoalCreate | 201 SavingsGoalRead |
| DELETE | `/finance/savings-goals/{item_id}` | — | 204 |
| GET | `/finance/savings-goals/{item_id}` | — | 200 SavingsGoalRead |
| PATCH | `/finance/savings-goals/{item_id}` | SavingsGoalUpdate | 200 SavingsGoalRead |
| GET | `/finance/subscriptions` | — | 200 Page |
| POST | `/finance/subscriptions` | SubscriptionCreate | 201 SubscriptionRead |
| POST | `/finance/subscriptions/process` | — | 200 |
| DELETE | `/finance/subscriptions/{item_id}` | — | 204 |
| GET | `/finance/subscriptions/{item_id}` | — | 200 SubscriptionRead |
| PATCH | `/finance/subscriptions/{item_id}` | SubscriptionUpdate | 200 SubscriptionRead |
| GET | `/finance/transactions` | — | 200 |
| POST | `/finance/transactions` | TransactionCreate | 201 TransactionRead |
| DELETE | `/finance/transactions/{item_id}` | — | 204 |
| GET | `/finance/transactions/{item_id}` | — | 200 TransactionRead |
| PATCH | `/finance/transactions/{item_id}` | TransactionUpdate | 200 TransactionRead |

### flashcards

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/flashcards/cards` | — | 200 CardRead[] |
| POST | `/flashcards/cards` | CardCreate | 201 CardRead |
| GET | `/flashcards/cards/{card_id}/history` | — | 200 |
| POST | `/flashcards/cards/{card_id}/review` | ReviewIn | 200 CardRead |
| DELETE | `/flashcards/cards/{item_id}` | — | 204 |
| GET | `/flashcards/cards/{item_id}` | — | 200 CardRead |
| PATCH | `/flashcards/cards/{item_id}` | CardUpdate | 200 CardRead |
| GET | `/flashcards/decks` | — | 200 DeckRead[] |
| POST | `/flashcards/decks` | DeckCreate | 201 DeckRead |
| DELETE | `/flashcards/decks/{item_id}` | — | 204 |
| GET | `/flashcards/decks/{item_id}` | — | 200 DeckRead |
| PATCH | `/flashcards/decks/{item_id}` | DeckUpdate | 200 DeckRead |
| GET | `/flashcards/stats` | — | 200 |
| GET | `/flashcards/study` | — | 200 CardRead[] |

### focus

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/focus/active` | — | 200 |
| GET | `/focus/distractions` | — | 200 DistractionRead[] |
| POST | `/focus/distractions` | DistractionIn | 201 DistractionRead |
| GET | `/focus/history` | — | 200 FocusRead[] |
| POST | `/focus/start` | FocusStartIn | 201 FocusRead |
| GET | `/focus/stats` | — | 200 |
| POST | `/focus/{sid}/cancel` | — | 200 FocusRead |
| POST | `/focus/{sid}/finish` | — | 200 FocusRead |
| POST | `/focus/{sid}/heartbeat` | — | 200 FocusRead |
| POST | `/focus/{sid}/pause` | — | 200 FocusRead |
| POST | `/focus/{sid}/resume` | — | 200 FocusRead |

### gamification

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/achievements` | — | 200 |
| POST | `/achievements/{code}/visibility` | application/json | 200 |
| POST | `/gamification/recheck` | — | 200 |
| GET | `/gamification/summary` | — | 200 |
| GET | `/gamification/xp-history` | — | 200 |

### goals

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/goals` | — | 200 GoalRead[] |
| POST | `/goals` | GoalCreate | 201 GoalRead |
| GET | `/goals/stats` | — | 200 |
| DELETE | `/goals/{goal_id}` | — | 204 |
| GET | `/goals/{goal_id}` | — | 200 GoalDetail |
| PATCH | `/goals/{goal_id}` | GoalUpdate | 200 GoalRead |
| POST | `/goals/{goal_id}/milestones` | MilestoneCreate | 201 MilestoneRead |
| DELETE | `/goals/{goal_id}/milestones/{ms_id}` | — | 204 |
| PATCH | `/goals/{goal_id}/milestones/{ms_id}` | MilestoneUpdate | 200 MilestoneRead |
| POST | `/goals/{goal_id}/milestones/{ms_id}/toggle` | — | 200 MilestoneRead |

### habits

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/habits` | — | 200 HabitRead[] |
| POST | `/habits` | HabitCreate | 201 HabitRead |
| DELETE | `/habits/{habit_id}` | — | 204 |
| GET | `/habits/{habit_id}` | — | 200 HabitRead |
| PATCH | `/habits/{habit_id}` | HabitUpdate | 200 HabitRead |
| DELETE | `/habits/{habit_id}/check` | — | 204 |
| POST | `/habits/{habit_id}/check` | HabitCheckIn | 200 HabitLogRead |
| GET | `/habits/{habit_id}/heatmap` | — | 200 |
| GET | `/habits/{habit_id}/logs` | — | 200 HabitLogRead[] |
| GET | `/habits/{habit_id}/stats` | — | 200 |

### health

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/health/exercises` | — | 200 Page |
| POST | `/health/exercises` | ExerciseCreate | 201 ExerciseRead |
| GET | `/health/exercises/{eid}/progress` | — | 200 |
| DELETE | `/health/exercises/{item_id}` | — | 204 |
| GET | `/health/exercises/{item_id}` | — | 200 ExerciseRead |
| PATCH | `/health/exercises/{item_id}` | ExerciseUpdate | 200 ExerciseRead |
| GET | `/health/logs` | — | 200 Page |
| POST | `/health/logs` | HealthLogCreate | 201 HealthLogRead |
| DELETE | `/health/logs/{item_id}` | — | 204 |
| GET | `/health/logs/{item_id}` | — | 200 HealthLogRead |
| PATCH | `/health/logs/{item_id}` | HealthLogUpdate | 200 HealthLogRead |
| GET | `/health/plans` | — | 200 Page |
| POST | `/health/plans` | WorkoutPlanCreate | 201 WorkoutPlanRead |
| DELETE | `/health/plans/{item_id}` | — | 204 |
| GET | `/health/plans/{item_id}` | — | 200 WorkoutPlanRead |
| PATCH | `/health/plans/{item_id}` | WorkoutPlanUpdate | 200 WorkoutPlanRead |
| GET | `/health/summary` | — | 200 |
| GET | `/health/workouts` | — | 200 WorkoutRead[] |
| POST | `/health/workouts` | WorkoutCreate | 201 WorkoutRead |
| DELETE | `/health/workouts/{wid}` | — | 204 |
| PATCH | `/health/workouts/{wid}` | WorkoutUpdate | 200 WorkoutRead |

### integrations

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/integrations` | — | 200 |
| DELETE | `/integrations/google` | — | 204 |
| GET | `/integrations/google/callback` | — | 200 |
| GET | `/integrations/google/connect` | — | 200 |
| POST | `/integrations/google/sync` | — | 200 |

### journal

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/journal/calendar` | — | 200 |
| GET | `/journal/entries` | — | 200 Page |
| POST | `/journal/entries` | JournalCreate | 201 JournalRead |
| DELETE | `/journal/entries/{item_id}` | — | 204 |
| GET | `/journal/entries/{item_id}` | — | 200 JournalRead |
| PATCH | `/journal/entries/{item_id}` | JournalUpdate | 200 JournalRead |
| GET | `/journal/export.md` | — | 200 |
| GET | `/journal/templates` | — | 200 JournalTemplateRead[] |
| POST | `/journal/templates` | JournalTemplateCreate | 201 JournalTemplateRead |
| DELETE | `/journal/templates/{item_id}` | — | 204 |
| GET | `/journal/templates/{item_id}` | — | 200 JournalTemplateRead |
| PATCH | `/journal/templates/{item_id}` | JournalTemplateUpdate | 200 JournalTemplateRead |

### learning

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/learning/courses` | — | 200 CourseRead[] |
| POST | `/learning/courses` | CourseCreate | 201 CourseRead |
| GET | `/learning/courses/{course_id}/detail` | — | 200 |
| DELETE | `/learning/courses/{item_id}` | — | 204 |
| GET | `/learning/courses/{item_id}` | — | 200 CourseRead |
| PATCH | `/learning/courses/{item_id}` | CourseUpdate | 200 CourseRead |
| GET | `/learning/dashboard` | — | 200 |
| GET | `/learning/lessons` | — | 200 Page |
| POST | `/learning/lessons` | LessonCreate | 201 LessonRead |
| DELETE | `/learning/lessons/{item_id}` | — | 204 |
| GET | `/learning/lessons/{item_id}` | — | 200 LessonRead |
| PATCH | `/learning/lessons/{item_id}` | LessonUpdate | 200 LessonRead |
| POST | `/learning/lessons/{lesson_id}/toggle` | — | 200 LessonRead |
| GET | `/learning/resources` | — | 200 Page |
| POST | `/learning/resources` | ResourceCreate | 201 ResourceRead |
| DELETE | `/learning/resources/{item_id}` | — | 204 |
| GET | `/learning/resources/{item_id}` | — | 200 ResourceRead |
| PATCH | `/learning/resources/{item_id}` | ResourceUpdate | 200 ResourceRead |
| GET | `/learning/sessions` | — | 200 Page |
| POST | `/learning/sessions` | LearningSessionCreate | 201 LearningSessionRead |
| DELETE | `/learning/sessions/{item_id}` | — | 204 |
| GET | `/learning/sessions/{item_id}` | — | 200 LearningSessionRead |
| PATCH | `/learning/sessions/{item_id}` | LearningSessionUpdate | 200 LearningSessionRead |
| GET | `/learning/subjects` | — | 200 Page |
| POST | `/learning/subjects` | SubjectCreate | 201 SubjectRead |
| DELETE | `/learning/subjects/{item_id}` | — | 204 |
| GET | `/learning/subjects/{item_id}` | — | 200 SubjectRead |
| PATCH | `/learning/subjects/{item_id}` | SubjectUpdate | 200 SubjectRead |
| GET | `/learning/subjects/{subject_id}/detail` | — | 200 |

### notes

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/folders` | — | 200 Page |
| POST | `/folders` | FolderCreate | 201 FolderRead |
| DELETE | `/folders/{item_id}` | — | 204 |
| GET | `/folders/{item_id}` | — | 200 FolderRead |
| PATCH | `/folders/{item_id}` | FolderUpdate | 200 FolderRead |
| GET | `/notes` | — | 200 Page |
| POST | `/notes` | NoteCreate | 201 NoteRead |
| GET | `/notes/graph` | — | 200 |
| DELETE | `/notes/{item_id}` | — | 204 |
| GET | `/notes/{item_id}` | — | 200 NoteRead |
| PATCH | `/notes/{item_id}` | NoteUpdate | 200 NoteRead |
| GET | `/notes/{note_id}/backlinks` | — | 200 |

### personal

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/bucket-list` | — | 200 Page |
| POST | `/bucket-list` | BucketCreate | 201 BucketRead |
| DELETE | `/bucket-list/{item_id}` | — | 204 |
| GET | `/bucket-list/{item_id}` | — | 200 BucketRead |
| PATCH | `/bucket-list/{item_id}` | BucketUpdate | 200 BucketRead |
| GET | `/timeline` | — | 200 |
| GET | `/timeline/events` | — | 200 Page |
| POST | `/timeline/events` | TimelineCreate | 201 TimelineRead |
| DELETE | `/timeline/events/{item_id}` | — | 204 |
| GET | `/timeline/events/{item_id}` | — | 200 TimelineRead |
| PATCH | `/timeline/events/{item_id}` | TimelineUpdate | 200 TimelineRead |
| GET | `/vision-boards` | — | 200 Page |
| POST | `/vision-boards` | VisionBoardCreate | 201 VisionBoardRead |
| DELETE | `/vision-boards/{item_id}` | — | 204 |
| GET | `/vision-boards/{item_id}` | — | 200 VisionBoardRead |
| PATCH | `/vision-boards/{item_id}` | VisionBoardUpdate | 200 VisionBoardRead |
| GET | `/vision-items` | — | 200 Page |
| POST | `/vision-items` | VisionItemCreate | 201 VisionItemRead |
| DELETE | `/vision-items/{item_id}` | — | 204 |
| GET | `/vision-items/{item_id}` | — | 200 VisionItemRead |
| PATCH | `/vision-items/{item_id}` | VisionItemUpdate | 200 VisionItemRead |
| GET | `/wheel-of-life` | — | 200 Page |
| POST | `/wheel-of-life` | WheelCreate | 201 WheelReadAvg |
| DELETE | `/wheel-of-life/{item_id}` | — | 204 |
| GET | `/wheel-of-life/{item_id}` | — | 200 WheelReadAvg |
| PATCH | `/wheel-of-life/{item_id}` | WheelUpdate | 200 WheelReadAvg |

### reminders

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/notifications` | — | 200 NotificationRead[] |
| POST | `/notifications/browser-pending` | — | 200 NotificationRead[] |
| GET | `/notifications/channels` | — | 200 |
| GET | `/notifications/deliveries` | — | 200 DeliveryRead[] |
| POST | `/notifications/deliveries/{did}/retry` | — | 200 DeliveryRead |
| POST | `/notifications/push-subscriptions` | PushSubIn | 201 |
| POST | `/notifications/read-all` | — | 200 |
| GET | `/notifications/unread-count` | — | 200 |
| POST | `/notifications/{nid}/read` | — | 200 NotificationRead |
| GET | `/reminders` | — | 200 ReminderRead[] |
| POST | `/reminders` | ReminderCreate | 201 ReminderRead |
| DELETE | `/reminders/{rid}` | — | 204 |
| PATCH | `/reminders/{rid}` | ReminderUpdate | 200 ReminderRead |
| POST | `/reminders/{rid}/reschedule` | RescheduleIn | 200 ReminderRead |
| POST | `/reminders/{rid}/snooze` | SnoozeIn | 200 ReminderRead |

### social

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/social/feed` | — | 200 |
| GET | `/social/friends` | — | 200 |
| POST | `/social/friends/request` | FriendRequestIn | 201 |
| DELETE | `/social/friends/{fid}` | — | 204 |
| POST | `/social/friends/{fid}/accept` | — | 200 |
| POST | `/social/friends/{fid}/block` | — | 200 |
| GET | `/social/goals/shared-with-me` | — | 200 |
| POST | `/social/goals/{goal_id}/share` | ShareGoalIn | 201 |
| GET | `/social/groups` | — | 200 |
| POST | `/social/groups` | GroupIn | 201 |
| POST | `/social/groups/{gid}/members` | MemberIn | 201 |
| DELETE | `/social/groups/{gid}/members/me` | — | 204 |
| GET | `/social/users/{uid}/profile` | — | 200 |

### system

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/api/health` | — | 200 |

### tasks

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/tasks` | — | 200 |
| POST | `/tasks` | TaskCreate | 201 TaskRead |
| POST | `/tasks/bulk` | BulkTaskIn | 200 |
| POST | `/tasks/quick` | application/json | 201 TaskRead |
| GET | `/tasks/tags` | — | 200 |
| DELETE | `/tasks/{task_id}` | — | 204 |
| GET | `/tasks/{task_id}` | — | 200 TaskRead |
| PATCH | `/tasks/{task_id}` | TaskUpdate | 200 TaskRead |
| PATCH | `/tasks/{task_id}/checklist/{item_id}` | ChecklistItemIn | 200 ChecklistItemRead |
| GET | `/tasks/{task_id}/comments` | — | 200 |
| POST | `/tasks/{task_id}/comments` | CommentIn | 201 |
| DELETE | `/tasks/{task_id}/comments/{comment_id}` | — | 204 |
| POST | `/tasks/{task_id}/dependencies` | DependencyIn | 201 |
| DELETE | `/tasks/{task_id}/dependencies/{dep_id}` | — | 204 |
| POST | `/tasks/{task_id}/duplicate` | — | 201 TaskRead |
| GET | `/tasks/{task_id}/history` | — | 200 |
| POST | `/tasks/{task_id}/move` | MoveTaskIn | 200 TaskRead |
| POST | `/tasks/{task_id}/restore` | — | 200 TaskRead |

### users

| Method | Path | Request | Success |
|---|---|---|---|
| GET | `/exports/full` | — | 200 |
| GET | `/profiles/me` | — | 200 ProfileRead |
| PATCH | `/profiles/me` | ProfileUpdate | 200 ProfileRead |
| GET | `/settings` | — | 200 SettingsRead |
| PATCH | `/settings` | SettingsUpdate | 200 SettingsRead |
| GET | `/users/me` | — | 200 MeRead |
| POST | `/users/me/delete` | DeleteAccountIn | 204 |

## Schemas

Request/response schemas (field types, limits, enums) are defined in `backend/app/schemas/` and published in the OpenAPI spec.
