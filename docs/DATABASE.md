# DATABASE.md — PostgreSQL schema

PostgreSQL 16, SQLAlchemy 2 models in `backend/app/models/`, migrations in `backend/alembic/versions/` (Alembic).

## Conventions

- Primary keys: UUID v4. Timestamps: `created_at`, `updated_at` (timestamptz, UTC).
- Ownership: every user-owned table has `user_id → users.id ON DELETE CASCADE` (+ index). All queries filter by it.
- Soft delete (`deleted_at`) on: goals, tasks, habits, calendar_events, subjects, courses, decks, books, transactions, journal_entries, notes, workout_plans. Hard delete elsewhere.
- Idempotency / dedup constraints: `xp_transactions (user_id, idempotency_key)`, `habit_logs (habit_id, log_date)`, `notifications (dedup_key)`, `notification_deliveries (notification_id, channel)`, `user_achievements (user_id, achievement_id)`.
- Money: `NUMERIC(14,2)` with a 3-letter currency code per row.
- Account deletion cascades through all owned rows; uploaded files are removed from disk.

## Deviations from the minimal entity list (intentional, documented)

- `subtasks` → `tasks.parent_id` (self-reference); subtasks are full tasks.
- `goal_tasks` → `tasks.goal_id` / `tasks.milestone_id` foreign keys (a task belongs to at most one goal).
- `habit_schedules` → `habits.frequency` + `habits.schedule` JSON (`weekdays`, `times_per_period`, `interval_days`).
- `event_reminders` → generic `reminders` rows with `entity_type='event'` (one reminder engine for all entity types).
- `groups`/`group_members`/`shared_goals`/`friendships` as listed; plus `task_dependencies`, `task_comments`, `goal_history`, `one_time_tokens`, `push_subscriptions`, `connected_accounts`, `activity_events`.

## Migrations

```bash
cd backend
alembic upgrade head          # apply
alembic revision --autogenerate -m 'msg'   # new migration after model changes
alembic downgrade -1           # roll back one step
alembic check                  # verify models and migrations are in sync
```
Migrations never drop user data implicitly; destructive changes must be written by hand with a data-preserving path.

## Tables

### `achievements`

| Column | Type | Null | Notes |
|---|---|---|---|
| code | VARCHAR(60) | no |  |
| title_ru | VARCHAR(120) | no |  |
| title_en | VARCHAR(120) | no |  |
| description_ru | VARCHAR(300) | no |  |
| icon | VARCHAR(40) | no |  |
| xp_reward | INTEGER | no |  |
| condition | JSON | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |

Unique: (code)

### `users`

| Column | Type | Null | Notes |
|---|---|---|---|
| email | VARCHAR(320) | no | indexed |
| password_hash | VARCHAR(255) | yes |  |
| is_active | BOOLEAN | no |  |
| email_verified_at | DATETIME | yes |  |
| google_sub | VARCHAR(255) | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |

Unique: (google_sub)

### `activity_events`

| Column | Type | Null | Notes |
|---|---|---|---|
| kind | VARCHAR(50) | no | indexed |
| entity_type | VARCHAR(40) | no |  |
| entity_id | UUID | yes |  |
| data | JSON | no |  |
| occurred_at | DATETIME | no | indexed |
| id | UUID | no | PK |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `ai_conversations`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(200) | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `attachments`

| Column | Type | Null | Notes |
|---|---|---|---|
| filename | VARCHAR(255) | no |  |
| content_type | VARCHAR(100) | no |  |
| size | INTEGER | no |  |
| storage_key | VARCHAR(255) | no |  |
| entity_type | VARCHAR(40) | yes | indexed |
| entity_id | UUID | yes | indexed |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

Unique: (storage_key)

### `books`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(300) | no |  |
| author | VARCHAR(200) | no |  |
| cover_url | VARCHAR(500) | yes |  |
| description | TEXT | no |  |
| total_pages | INTEGER | yes |  |
| current_page | INTEGER | no |  |
| status | VARCHAR(20) | no | indexed |
| rating | INTEGER | yes |  |
| started_on | DATE | yes |  |
| finished_on | DATE | yes |  |
| is_favorite | BOOLEAN | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| deleted_at | DATETIME | yes | indexed |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `bucket_list_items`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(200) | no |  |
| description | TEXT | no |  |
| kind | VARCHAR(20) | no |  |
| category | VARCHAR(60) | no |  |
| status | VARCHAR(20) | no |  |
| target_date | DATE | yes |  |
| done_on | DATE | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `budgets`

| Column | Type | Null | Notes |
|---|---|---|---|
| category | VARCHAR(60) | no |  |
| month | DATE | no |  |
| limit_amount | NUMERIC(14, 2) | no |  |
| currency | VARCHAR(3) | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `connected_accounts`

| Column | Type | Null | Notes |
|---|---|---|---|
| provider | VARCHAR(20) | no |  |
| external_email | VARCHAR(320) | no |  |
| access_token_enc | TEXT | no |  |
| refresh_token_enc | TEXT | yes |  |
| expires_at | DATETIME | yes |  |
| scope | TEXT | no |  |
| last_sync_at | DATETIME | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

Unique: (user_id, provider)

### `exercises`

| Column | Type | Null | Notes |
|---|---|---|---|
| name | VARCHAR(120) | no |  |
| muscle_group | VARCHAR(60) | no |  |
| kind | VARCHAR(20) | no |  |
| notes | TEXT | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `folders`

| Column | Type | Null | Notes |
|---|---|---|---|
| name | VARCHAR(120) | no |  |
| parent_id | UUID | yes | FK → folders.id (CASCADE), indexed |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `friendships`

| Column | Type | Null | Notes |
|---|---|---|---|
| requester_id | UUID | no | FK → users.id (CASCADE), indexed |
| addressee_id | UUID | no | FK → users.id (CASCADE), indexed |
| status | VARCHAR(10) | no |  |
| blocked_by | UUID | yes | FK → users.id (CASCADE), indexed |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |

Unique: (requester_id, addressee_id)

### `goals`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(200) | no |  |
| description | TEXT | no |  |
| category | VARCHAR(40) | no | indexed |
| priority | INTEGER | no |  |
| status | VARCHAR(20) | no | indexed |
| start_date | DATE | yes |  |
| deadline | DATE | yes |  |
| metric_name | VARCHAR(80) | yes |  |
| metric_target | FLOAT | yes |  |
| metric_current | FLOAT | yes |  |
| notes | TEXT | no |  |
| completed_at | DATETIME | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| deleted_at | DATETIME | yes | indexed |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `groups`

| Column | Type | Null | Notes |
|---|---|---|---|
| owner_id | UUID | no | FK → users.id (CASCADE), indexed |
| name | VARCHAR(120) | no |  |
| description | TEXT | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |

### `health_logs`

| Column | Type | Null | Notes |
|---|---|---|---|
| kind | VARCHAR(20) | no | indexed |
| log_date | DATE | no | indexed |
| value | FLOAT | no |  |
| note | TEXT | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `journal_templates`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(120) | no |  |
| kind | VARCHAR(20) | no |  |
| prompts | JSON | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `life_timeline_events`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(200) | no |  |
| description | TEXT | no |  |
| occurred_on | DATE | no | indexed |
| kind | VARCHAR(20) | no |  |
| source_type | VARCHAR(40) | yes |  |
| source_id | UUID | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `one_time_tokens`

| Column | Type | Null | Notes |
|---|---|---|---|
| purpose | VARCHAR(20) | no |  |
| token_hash | VARCHAR(64) | no | indexed |
| expires_at | DATETIME | no |  |
| used_at | DATETIME | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `profiles`

| Column | Type | Null | Notes |
|---|---|---|---|
| name | VARCHAR(120) | no |  |
| avatar_url | VARCHAR(500) | yes |  |
| bio | TEXT | no |  |
| timezone | VARCHAR(64) | no |  |
| language | VARCHAR(5) | no |  |
| is_public | BOOLEAN | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

Unique: (user_id)

### `push_subscriptions`

| Column | Type | Null | Notes |
|---|---|---|---|
| endpoint | VARCHAR(600) | no |  |
| keys | JSON | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

Unique: (endpoint)

### `reminders`

| Column | Type | Null | Notes |
|---|---|---|---|
| kind | VARCHAR(20) | no |  |
| title | VARCHAR(200) | no |  |
| body | TEXT | no |  |
| entity_type | VARCHAR(40) | yes |  |
| entity_id | UUID | yes |  |
| channels | JSON | no |  |
| first_fire_at | DATETIME | no |  |
| next_fire_at | DATETIME | yes | indexed |
| recurrence_rule | VARCHAR(200) | yes |  |
| timezone | VARCHAR(64) | no |  |
| is_active | BOOLEAN | no | indexed |
| last_fired_at | DATETIME | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `savings_goals`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(200) | no |  |
| target_amount | NUMERIC(14, 2) | no |  |
| saved_amount | NUMERIC(14, 2) | no |  |
| currency | VARCHAR(3) | no |  |
| deadline | DATE | yes |  |
| is_purchase_plan | BOOLEAN | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `sessions`

| Column | Type | Null | Notes |
|---|---|---|---|
| refresh_token_hash | VARCHAR(64) | no | indexed |
| user_agent | VARCHAR(300) | no |  |
| ip | VARCHAR(64) | no |  |
| expires_at | DATETIME | no |  |
| revoked_at | DATETIME | yes |  |
| last_used_at | DATETIME | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `settings`

| Column | Type | Null | Notes |
|---|---|---|---|
| theme | VARCHAR(10) | no |  |
| currency | VARCHAR(3) | no |  |
| week_start | INTEGER | no |  |
| dashboard_layout | JSON | no |  |
| notification_prefs | JSON | no |  |
| quiet_hours_start | VARCHAR(5) | yes |  |
| quiet_hours_end | VARCHAR(5) | yes |  |
| ai_enabled | BOOLEAN | no |  |
| ai_context | JSON | no |  |
| social_enabled | BOOLEAN | no |  |
| gamification_enabled | BOOLEAN | no |  |
| reading_goal_yearly | INTEGER | no |  |
| categories | JSON | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

Unique: (user_id)

### `subjects`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(200) | no |  |
| description | TEXT | no |  |
| color | VARCHAR(20) | no |  |
| area | VARCHAR(80) | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| deleted_at | DATETIME | yes | indexed |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `subscriptions`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(200) | no |  |
| amount | NUMERIC(14, 2) | no |  |
| currency | VARCHAR(3) | no |  |
| category | VARCHAR(60) | no |  |
| period | VARCHAR(10) | no |  |
| next_payment_on | DATE | no |  |
| is_active | BOOLEAN | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `tags`

| Column | Type | Null | Notes |
|---|---|---|---|
| name | VARCHAR(60) | no |  |
| color | VARCHAR(20) | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

Unique: (user_id, name)

### `user_achievements`

| Column | Type | Null | Notes |
|---|---|---|---|
| achievement_id | UUID | no | FK → achievements.id (CASCADE), indexed |
| unlocked_at | DATETIME | no |  |
| is_public | BOOLEAN | no |  |
| id | UUID | no | PK |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

Unique: (user_id, achievement_id)

### `vision_boards`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(200) | no |  |
| description | TEXT | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `wheel_of_life_entries`

| Column | Type | Null | Notes |
|---|---|---|---|
| assessed_on | DATE | no | indexed |
| scores | JSON | no |  |
| note | TEXT | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `workout_plans`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(200) | no |  |
| description | TEXT | no |  |
| weekdays | JSON | no |  |
| exercises | JSON | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| deleted_at | DATETIME | yes | indexed |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `xp_transactions`

| Column | Type | Null | Notes |
|---|---|---|---|
| amount | INTEGER | no |  |
| reason | VARCHAR(60) | no |  |
| source_type | VARCHAR(40) | no |  |
| source_id | UUID | yes |  |
| idempotency_key | VARCHAR(200) | no |  |
| created_at | DATETIME | no | indexed |
| id | UUID | no | PK |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

Unique: (user_id, idempotency_key)

### `ai_messages`

| Column | Type | Null | Notes |
|---|---|---|---|
| conversation_id | UUID | no | FK → ai_conversations.id (CASCADE), indexed |
| role | VARCHAR(10) | no |  |
| content | TEXT | no |  |
| created_at | DATETIME | no | indexed |
| id | UUID | no | PK |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `book_notes`

| Column | Type | Null | Notes |
|---|---|---|---|
| book_id | UUID | no | FK → books.id (CASCADE), indexed |
| kind | VARCHAR(10) | no |  |
| text | TEXT | no |  |
| page | INTEGER | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `challenges`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(200) | no |  |
| description | TEXT | no |  |
| metric | VARCHAR(40) | no |  |
| target | INTEGER | no |  |
| start_date | DATE | no |  |
| end_date | DATE | no |  |
| group_id | UUID | yes | FK → groups.id (CASCADE), indexed |
| xp_reward | INTEGER | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `courses`

| Column | Type | Null | Notes |
|---|---|---|---|
| subject_id | UUID | yes | FK → subjects.id (SET NULL), indexed |
| goal_id | UUID | yes | FK → goals.id (SET NULL), indexed |
| title | VARCHAR(200) | no |  |
| description | TEXT | no |  |
| provider | VARCHAR(120) | no |  |
| url | VARCHAR(500) | yes |  |
| status | VARCHAR(20) | no |  |
| target_date | DATE | yes |  |
| weekly_minutes_goal | INTEGER | yes |  |
| path_position | INTEGER | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| deleted_at | DATETIME | yes | indexed |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `goal_history`

| Column | Type | Null | Notes |
|---|---|---|---|
| goal_id | UUID | no | FK → goals.id (CASCADE), indexed |
| field | VARCHAR(40) | no |  |
| old_value | TEXT | yes |  |
| new_value | TEXT | yes |  |
| changed_at | DATETIME | no |  |
| id | UUID | no | PK |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `group_members`

| Column | Type | Null | Notes |
|---|---|---|---|
| group_id | UUID | no | FK → groups.id (CASCADE), indexed |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |
| role | VARCHAR(10) | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |

Unique: (group_id, user_id)

### `habits`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(200) | no |  |
| description | TEXT | no |  |
| category | VARCHAR(40) | yes |  |
| icon | VARCHAR(40) | no |  |
| color | VARCHAR(20) | no |  |
| kind | VARCHAR(10) | no |  |
| frequency | VARCHAR(20) | no |  |
| schedule | JSON | no |  |
| target | FLOAT | no |  |
| unit | VARCHAR(20) | yes |  |
| allow_multiple_per_day | BOOLEAN | no |  |
| reminder_time | VARCHAR(5) | yes |  |
| start_date | DATE | no |  |
| end_date | DATE | yes |  |
| is_active | BOOLEAN | no |  |
| goal_id | UUID | yes | FK → goals.id (SET NULL), indexed |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| deleted_at | DATETIME | yes | indexed |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `journal_entries`

| Column | Type | Null | Notes |
|---|---|---|---|
| kind | VARCHAR(20) | no | indexed |
| title | VARCHAR(200) | no |  |
| body | TEXT | no |  |
| entry_date | DATE | no | indexed |
| mood | INTEGER | yes |  |
| tags | JSON | no |  |
| is_private | BOOLEAN | no |  |
| archived | BOOLEAN | no |  |
| template_id | UUID | yes | FK → journal_templates.id (SET NULL), indexed |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| deleted_at | DATETIME | yes | indexed |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `milestones`

| Column | Type | Null | Notes |
|---|---|---|---|
| goal_id | UUID | no | FK → goals.id (CASCADE), indexed |
| title | VARCHAR(200) | no |  |
| due_date | DATE | yes |  |
| position | INTEGER | no |  |
| completed_at | DATETIME | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `notifications`

| Column | Type | Null | Notes |
|---|---|---|---|
| reminder_id | UUID | yes | FK → reminders.id (CASCADE), indexed |
| title | VARCHAR(200) | no |  |
| body | TEXT | no |  |
| link | VARCHAR(300) | yes |  |
| dedup_key | VARCHAR(200) | no |  |
| read_at | DATETIME | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

Unique: (dedup_key)

### `reading_sessions`

| Column | Type | Null | Notes |
|---|---|---|---|
| book_id | UUID | no | FK → books.id (CASCADE), indexed |
| read_on | DATE | no | indexed |
| pages | INTEGER | no |  |
| minutes | INTEGER | no |  |
| end_page | INTEGER | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `shared_goals`

| Column | Type | Null | Notes |
|---|---|---|---|
| goal_id | UUID | no | FK → goals.id (CASCADE), indexed |
| owner_id | UUID | no | FK → users.id (CASCADE), indexed |
| shared_with_id | UUID | no | FK → users.id (CASCADE), indexed |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |

Unique: (goal_id, shared_with_id)

### `transactions`

| Column | Type | Null | Notes |
|---|---|---|---|
| kind | VARCHAR(10) | no | indexed |
| amount | NUMERIC(14, 2) | no |  |
| currency | VARCHAR(3) | no |  |
| category | VARCHAR(60) | no | indexed |
| description | VARCHAR(300) | no |  |
| occurred_on | DATE | no | indexed |
| subscription_id | UUID | yes | FK → subscriptions.id (SET NULL), indexed |
| savings_goal_id | UUID | yes | FK → savings_goals.id (SET NULL), indexed |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| deleted_at | DATETIME | yes | indexed |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `vision_board_items`

| Column | Type | Null | Notes |
|---|---|---|---|
| board_id | UUID | no | FK → vision_boards.id (CASCADE), indexed |
| kind | VARCHAR(10) | no |  |
| content | TEXT | no |  |
| image_url | VARCHAR(500) | yes |  |
| url | VARCHAR(500) | yes |  |
| goal_id | UUID | yes | FK → goals.id (SET NULL), indexed |
| group_label | VARCHAR(60) | no |  |
| position | INTEGER | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `workouts`

| Column | Type | Null | Notes |
|---|---|---|---|
| plan_id | UUID | yes | FK → workout_plans.id (SET NULL), indexed |
| title | VARCHAR(200) | no |  |
| performed_on | DATE | no | indexed |
| duration_minutes | INTEGER | no |  |
| is_rest_day | BOOLEAN | no |  |
| notes | TEXT | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `ai_tool_actions`

| Column | Type | Null | Notes |
|---|---|---|---|
| conversation_id | UUID | no | FK → ai_conversations.id (CASCADE), indexed |
| message_id | UUID | yes | FK → ai_messages.id (CASCADE), indexed |
| tool | VARCHAR(40) | no |  |
| arguments | JSON | no |  |
| status | VARCHAR(20) | no |  |
| result_entity_id | UUID | yes |  |
| error | TEXT | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `challenge_progress`

| Column | Type | Null | Notes |
|---|---|---|---|
| challenge_id | UUID | no | FK → challenges.id (CASCADE), indexed |
| value | INTEGER | no |  |
| completed_at | DATETIME | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

Unique: (challenge_id, user_id)

### `decks`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(200) | no |  |
| description | TEXT | no |  |
| course_id | UUID | yes | FK → courses.id (SET NULL), indexed |
| new_cards_per_day | INTEGER | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| deleted_at | DATETIME | yes | indexed |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `habit_logs`

| Column | Type | Null | Notes |
|---|---|---|---|
| habit_id | UUID | no | FK → habits.id (CASCADE), indexed |
| log_date | DATE | no | indexed |
| value | FLOAT | no |  |
| status | VARCHAR(10) | no |  |
| note | TEXT | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

Unique: (habit_id, log_date)

### `lessons`

| Column | Type | Null | Notes |
|---|---|---|---|
| course_id | UUID | no | FK → courses.id (CASCADE), indexed |
| title | VARCHAR(200) | no |  |
| content | TEXT | no |  |
| position | INTEGER | no |  |
| duration_minutes | INTEGER | yes |  |
| completed_at | DATETIME | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `notification_deliveries`

| Column | Type | Null | Notes |
|---|---|---|---|
| notification_id | UUID | no | FK → notifications.id (CASCADE), indexed |
| channel | VARCHAR(20) | no |  |
| status | VARCHAR(20) | no |  |
| attempts | INTEGER | no |  |
| last_error | TEXT | yes |  |
| next_attempt_at | DATETIME | yes | indexed |
| sent_at | DATETIME | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

Unique: (notification_id, channel)

### `tasks`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(300) | no |  |
| description | TEXT | no |  |
| status | VARCHAR(20) | no | indexed |
| priority | INTEGER | no |  |
| category | VARCHAR(40) | yes |  |
| due_at | DATETIME | yes | indexed |
| estimated_minutes | INTEGER | yes |  |
| actual_minutes | INTEGER | no |  |
| position | FLOAT | no |  |
| recurrence_rule | VARCHAR(200) | yes |  |
| parent_id | UUID | yes | FK → tasks.id (CASCADE), indexed |
| goal_id | UUID | yes | FK → goals.id (SET NULL), indexed |
| milestone_id | UUID | yes | FK → milestones.id (SET NULL), indexed |
| is_template | BOOLEAN | no |  |
| archived | BOOLEAN | no | indexed |
| completed_at | DATETIME | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| deleted_at | DATETIME | yes | indexed |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `workout_sets`

| Column | Type | Null | Notes |
|---|---|---|---|
| workout_id | UUID | no | FK → workouts.id (CASCADE), indexed |
| exercise_id | UUID | no | FK → exercises.id (CASCADE), indexed |
| set_number | INTEGER | no |  |
| reps | INTEGER | yes |  |
| weight_kg | FLOAT | yes |  |
| duration_seconds | INTEGER | yes |  |
| distance_km | FLOAT | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `calendar_events`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(200) | no |  |
| description | TEXT | no |  |
| location | VARCHAR(200) | no |  |
| category | VARCHAR(40) | no |  |
| color | VARCHAR(20) | no |  |
| starts_at | DATETIME | no | indexed |
| ends_at | DATETIME | no |  |
| all_day | BOOLEAN | no |  |
| timezone | VARCHAR(64) | no |  |
| recurrence_rule | VARCHAR(200) | yes |  |
| is_time_block | BOOLEAN | no |  |
| task_id | UUID | yes | FK → tasks.id (SET NULL), indexed |
| goal_id | UUID | yes | FK → goals.id (SET NULL), indexed |
| habit_id | UUID | yes | FK → habits.id (SET NULL), indexed |
| external_source | VARCHAR(20) | yes |  |
| external_uid | VARCHAR(255) | yes | indexed |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| deleted_at | DATETIME | yes | indexed |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `flashcards`

| Column | Type | Null | Notes |
|---|---|---|---|
| deck_id | UUID | no | FK → decks.id (CASCADE), indexed |
| front | TEXT | no |  |
| back | TEXT | no |  |
| image_attachment_id | UUID | yes | FK → attachments.id (SET NULL), indexed |
| tags | JSON | no |  |
| ease_factor | FLOAT | no |  |
| interval_days | INTEGER | no |  |
| repetitions | INTEGER | no |  |
| due_date | DATE | yes | indexed |
| lapses | INTEGER | no |  |
| last_reviewed_at | DATETIME | yes |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `focus_sessions`

| Column | Type | Null | Notes |
|---|---|---|---|
| kind | VARCHAR(20) | no |  |
| status | VARCHAR(20) | no | indexed |
| planned_minutes | INTEGER | no |  |
| started_at | DATETIME | no | indexed |
| segment_started_at | DATETIME | yes |  |
| focused_seconds | INTEGER | no |  |
| ended_at | DATETIME | yes |  |
| task_id | UUID | yes | FK → tasks.id (SET NULL), indexed |
| subject_id | UUID | yes | FK → subjects.id (SET NULL), indexed |
| note | TEXT | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `learning_resources`

| Column | Type | Null | Notes |
|---|---|---|---|
| course_id | UUID | yes | FK → courses.id (CASCADE), indexed |
| lesson_id | UUID | yes | FK → lessons.id (CASCADE), indexed |
| kind | VARCHAR(20) | no |  |
| title | VARCHAR(200) | no |  |
| url | VARCHAR(500) | yes |  |
| attachment_id | UUID | yes | FK → attachments.id (SET NULL), indexed |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `learning_sessions`

| Column | Type | Null | Notes |
|---|---|---|---|
| subject_id | UUID | yes | FK → subjects.id (SET NULL), indexed |
| course_id | UUID | yes | FK → courses.id (SET NULL), indexed |
| lesson_id | UUID | yes | FK → lessons.id (SET NULL), indexed |
| started_at | DATETIME | no | indexed |
| duration_minutes | INTEGER | no |  |
| notes | TEXT | no |  |
| source | VARCHAR(20) | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `notes`

| Column | Type | Null | Notes |
|---|---|---|---|
| title | VARCHAR(300) | no |  |
| content | TEXT | no |  |
| folder_id | UUID | yes | FK → folders.id (SET NULL), indexed |
| category | VARCHAR(60) | yes |  |
| tags | JSON | no |  |
| is_favorite | BOOLEAN | no |  |
| archived | BOOLEAN | no |  |
| goal_id | UUID | yes | FK → goals.id (SET NULL), indexed |
| course_id | UUID | yes | FK → courses.id (SET NULL), indexed |
| book_id | UUID | yes | FK → books.id (SET NULL), indexed |
| task_id | UUID | yes | FK → tasks.id (SET NULL), indexed |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| deleted_at | DATETIME | yes | indexed |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `task_checklists`

| Column | Type | Null | Notes |
|---|---|---|---|
| task_id | UUID | no | FK → tasks.id (CASCADE), indexed |
| text | VARCHAR(300) | no |  |
| done | BOOLEAN | no |  |
| position | INTEGER | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `task_comments`

| Column | Type | Null | Notes |
|---|---|---|---|
| task_id | UUID | no | FK → tasks.id (CASCADE), indexed |
| body | TEXT | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `task_dependencies`

| Column | Type | Null | Notes |
|---|---|---|---|
| task_id | UUID | no | PK, FK → tasks.id (CASCADE) |
| depends_on_id | UUID | no | PK, FK → tasks.id (CASCADE) |

### `task_history`

| Column | Type | Null | Notes |
|---|---|---|---|
| task_id | UUID | no | FK → tasks.id (CASCADE), indexed |
| field | VARCHAR(40) | no |  |
| old_value | TEXT | yes |  |
| new_value | TEXT | yes |  |
| changed_at | DATETIME | no |  |
| id | UUID | no | PK |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `task_tags`

| Column | Type | Null | Notes |
|---|---|---|---|
| task_id | UUID | no | PK, FK → tasks.id (CASCADE) |
| name | VARCHAR(60) | no | PK |

### `distractions`

| Column | Type | Null | Notes |
|---|---|---|---|
| session_id | UUID | yes | FK → focus_sessions.id (CASCADE), indexed |
| description | VARCHAR(300) | no |  |
| occurred_at | DATETIME | no |  |
| id | UUID | no | PK |
| created_at | DATETIME | no |  |
| updated_at | DATETIME | no |  |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `flashcard_reviews`

| Column | Type | Null | Notes |
|---|---|---|---|
| card_id | UUID | no | FK → flashcards.id (CASCADE), indexed |
| grade | INTEGER | no |  |
| reviewed_at | DATETIME | no | indexed |
| prev_interval | INTEGER | no |  |
| new_interval | INTEGER | no |  |
| prev_ease | FLOAT | no |  |
| new_ease | FLOAT | no |  |
| id | UUID | no | PK |
| user_id | UUID | no | FK → users.id (CASCADE), indexed |

### `note_links`

| Column | Type | Null | Notes |
|---|---|---|---|
| source_id | UUID | no | PK, FK → notes.id (CASCADE) |
| target_id | UUID | no | PK, FK → notes.id (CASCADE) |
