#!/bin/sh
# Entrypoint for Dockerfile.render: migrate, then run API + Celery in the background and Next.js in front.
set -e
export FRONTEND_URL="${FRONTEND_URL:-$RENDER_EXTERNAL_URL}"
export CORS_ORIGINS="${CORS_ORIGINS:-$FRONTEND_URL}"

cd /app/backend
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips='*' --workers 1 &
celery -A app.workers.celery_app worker -B --loglevel=INFO --concurrency=1 \
  --schedule=/tmp/celerybeat-schedule &

cd /app/web
PORT="${PORT:-10000}" HOSTNAME=0.0.0.0 exec node server.js
