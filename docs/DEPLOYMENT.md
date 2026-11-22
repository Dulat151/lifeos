# DEPLOYMENT.md

## Single server with Docker Compose

1. Install Docker Engine + Compose plugin on the server.
2. Copy the repository, then:
   ```bash
   cp .env.example .env
   # set SECRET_KEY (long random), POSTGRES_PASSWORD, FRONTEND_URL=https://your.domain,
   # CORS_ORIGINS=https://your.domain, COOKIE_SECURE=true, optional SMTP/VAPID/AI/Google keys
   docker compose up -d --build
   docker compose ps          # all services healthy; "migrate" exits with code 0
   ```
3. Put a TLS reverse proxy in front of the `web` service (port `WEB_PORT`, default 3000). Example Caddyfile:
   ```
   your.domain {
     reverse_proxy 127.0.0.1:3000
   }
   ```
   Only the web port needs to be public: the API, PostgreSQL and Redis are reachable only on the internal Compose network.

### Services
| Service | Purpose |
|---|---|
| `db` | PostgreSQL 16 with volume `pgdata` |
| `redis` | Rate limiting + Celery broker (AOF persistence) |
| `migrate` | One-shot `alembic upgrade head` before api/worker/beat start |
| `api` | FastAPI (uvicorn, 2 workers), uploads volume `uploads`, health check `/api/health` |
| `worker` / `beat` | Celery: reminder cycle every 30 s, recurring payments hourly |
| `web` | Next.js standalone server, proxies `/api/*` to `api` |

### Updating
```bash
git pull && docker compose up -d --build   # migrate runs automatically before the new api starts
```

### Logging
Structured one-line request logs (method, path, status, duration, request id) on stdout: `docker compose logs -f api`.
Every response carries `X-Request-ID`.

## Backups
`scripts/backup.sh` writes `pg_dump -Fc` and an archive of uploaded files to `./backups`, keeping 14 days (`KEEP`).
Schedule it with cron, copy `./backups` off-site. Restore with `scripts/restore.sh <dump>` (asks for confirmation).
Test restores periodically on a staging machine.

## Without Docker
Run `alembic upgrade head`, then `uvicorn app.main:app --workers 2` behind a reverse proxy, the scheduler
(`python -m app.workers.scheduler` or Celery worker + beat) under systemd, and `next build && node .next/standalone/server.js`
with `BACKEND_URL` pointing at the API at build time.

## Google OAuth redirect
`GOOGLE_REDIRECT_URI` must be `https://your.domain/api/v1/integrations/google/callback` (through the web host, so the session cookie is sent) and registered in Google Cloud Console.
