# Integrations

| Service | How | Direction |
|---|---|---|
| Google Calendar | OAuth 2.0 (`calendar.events` scope) | two-way |
| Apple iCloud Calendar | CalDAV + app-specific password | two-way |
| Other CalDAV (Fastmail, Nextcloud, Yandex…) | CalDAV + login/password | two-way |
| Google Keep | file import (Google Takeout) | one-time import |
| Apple Notes | file import (Markdown / HTML / script) | one-time import |
| AI: Anthropic / OpenAI / Google Gemini | server-side API key | — |

Not possible: the **Google Keep API** only works for Google Workspace domains (not personal Gmail accounts),
and **Apple Notes / Apple Reminders** have no web API. That is why notes are imported from files.

## Calendar sync (Google and iCloud)

Runs on demand ("Синхронизировать" in Settings → Календари) and every `CALENDAR_SYNC_MINUTES` (default 15)
in the Celery worker. Window: 30 days back, 365 days ahead.

- New / changed / deleted remote events → created / updated / soft-deleted in LIFE OS.
- New / changed / deleted LIFE OS events → sent to the calendar. Events created in LIFE OS go to Google
  when it is connected, otherwise to the iCloud calendar.
- Both sides changed since the last sync → the newer edit wins.
- Recurring series are synced with their RRULE; a single modified occurrence of a series is not.
- When LIFE OS updates an event it rewrites title, time, place, description and recurrence; attendees and
  alarms set in Google / Apple are kept by Google (PATCH) but replaced on CalDAV.
- Events imported from an `.ics` file are never sent anywhere.
- **Which Google calendars:** Settings → Интеграции → Google Calendar → «Календари». Pick any calendars of the
  account (work, family, holidays…) and the calendar where events created in LIFE OS go. Read-only calendars
  (e.g. holidays) are imported but never written to. Unselecting a calendar removes its copies from LIFE OS only.

### Google Calendar setup (server admin, once)

1. https://console.cloud.google.com → create a project.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **OAuth consent screen** (Google Auth Platform) → External → app name "LIFE OS", your email.
   Scopes: `.../auth/calendar.events`, `openid`, `email`. While the app is in *Testing*, add every Google
   account that will connect under **Test users** (up to 100). Note: in Testing mode Google expires the
   refresh token after 7 days — press "Подключить" again, or publish the app.
4. **Credentials → Create credentials → OAuth client ID** → *Web application*.
   Authorized redirect URI: `https://YOUR-SITE/api/v1/integrations/google/callback`
   (locally: `http://localhost:3000/api/v1/integrations/google/callback`).
5. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `.env` (or Render → Environment) and restart.
   `GOOGLE_REDIRECT_URI` defaults to `FRONTEND_URL` + the path above.

### Apple iCloud Calendar (each user)

1. https://account.apple.com → Sign-In and Security → **App-Specific Passwords** → create one for "LIFE OS".
2. LIFE OS → Settings → Календари → Apple iCloud: Apple ID email + that password → "Найти календари" →
   pick a calendar → "Подключить".

The password is stored encrypted (Fernet, key derived from `SECRET_KEY`); it can be revoked at Apple at any
time. Changing `SECRET_KEY` makes stored calendar credentials unreadable — reconnect afterwards.
Server addresses on private / loopback networks are refused (SSRF protection) unless
`CALDAV_ALLOW_PRIVATE_HOSTS=true` (local testing only).

## Notes import

Settings → Импорт заметок (or Notes → "Импорт из Keep / Apple"). Accepts `.zip`, `.json`, `.md`, `.txt`, `.html`.
Notes land in the folders "Google Keep" / "Apple Notes"; re-importing the same files skips duplicates.

- **Google Keep:** https://takeout.google.com → deselect all → select **Keep** → export → upload the `.zip`.
  Checklists become `- [x]` lists, labels become tags, pinned notes become favourites, trashed notes are skipped.
- **Apple Notes:** on the Mac run `scripts/export-apple-notes.sh` (asks once for permission to control Notes;
  writes `~/Desktop/apple-notes-export.zip`, folders preserved, locked notes skipped), then upload the zip.
  Alternative for single notes on macOS 26+: Notes → File → Export as → Markdown.

## AI providers

`AI_PROVIDER=auto` (default) uses the first configured key: `ANTHROPIC_API_KEY`, then `OPENAI_API_KEY`,
then `GEMINI_API_KEY`. Set `AI_PROVIDER=gemini` (or `anthropic`/`openai`) to force one.
Gemini keys from Google AI Studio work directly; keys that only work in Vertex AI express mode are retried
there automatically. `GEMINI_MODEL` defaults to `gemini-flash-latest`.

## Integrations page and adding a service

`/integrations` renders the server-side registry `CATALOG` in `backend/app/api/v1/integrations.py`.
Statuses: `available` (implemented), `import` (file import), `planned` (shown honestly as not available —
no connect button). To add a service: add a registry entry, implement its endpoints (OAuth tokens are stored
encrypted in `connected_accounts`, provider-specific settings in `connected_accounts.meta`), and add its
card logic on the frontend. Planned today: Google Tasks, Google Drive, Notion, Todoist, Telegram.
