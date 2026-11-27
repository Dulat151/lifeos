# LIFE OS — Personal Development Operating System

> Build yourself. Master your time. Design your future.

LIFE OS объединяет цели, задачи, привычки, календарь, напоминания, обучение (курсы, карточки SM-2, книги), здоровье и фитнес, финансы, дневник, заметки с графом знаний, фокус-таймер, аналитику, геймификацию, AI-ассистента и социальные функции в одном веб-приложении (PWA). Интерфейс: русский (по умолчанию), казахский, английский.

| Слой | Технологии |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, компоненты в стиле shadcn/ui на Radix, Lucide, Recharts, React Hook Form + Zod, TanStack Query, dnd-kit |
| Backend | Python 3.13, FastAPI, Pydantic 2, SQLAlchemy 2, Alembic |
| Data | PostgreSQL 16, Redis 7 (rate limiting, очередь Celery) |
| Jobs | Celery worker + beat (напоминания каждые 30 с, регулярные платежи раз в час) или `python -m app.workers.scheduler` |
| Ops | Docker, Docker Compose, health checks, скрипты бэкапа |

## Быстрый старт (Docker)

```bash
cp .env.example .env          # задайте SECRET_KEY и POSTGRES_PASSWORD
docker compose up -d --build  # db, redis, migrate, api, worker, beat, web
open http://localhost:3000    # зарегистрируйтесь — первый пользователь готов к работе
```

Swagger UI: `http://localhost:3000/api/docs` (проксируется в API).

## Локальная разработка (без Docker)

Нужны PostgreSQL 16, Redis 7, Python 3.12+, Node 22.

```bash
# база
createuser -s lifeos && createdb -O lifeos lifeos

# backend
cd backend
pip install -r requirements-dev.txt
export DATABASE_URL=postgresql+psycopg://lifeos:lifeos@localhost:5432/lifeos
alembic upgrade head
uvicorn app.main:app --reload --port 8000      # API
python -m app.workers.scheduler                # движок напоминаний (в отдельном терминале)

# frontend
cd frontend
npm install
BACKEND_URL=http://localhost:8000 npm run dev  # http://localhost:3000
```

## Тесты

```bash
cd backend && createdb -O lifeos lifeos_test && pytest -q     # 42 теста на реальной PostgreSQL
cd frontend && npm run lint && npm test                       # TypeScript + Vitest
cd frontend && CHROME_PATH=/usr/bin/google-chrome npx playwright test   # E2E (нужен запущенный стек на :3000)
```

## Что нужно подключить для внешних функций

Приложение полностью работает без внешних ключей. Следующие функции честно показывают «не настроено», пока вы не зададите переменные в `.env`:

| Функция | Переменные |
|---|---|
| Письма (подтверждение email, сброс пароля, email-напоминания) | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` |
| Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (`npx web-push generate-vapid-keys`) |
| AI-ассистент | `ANTHROPIC_API_KEY` (или `AI_PROVIDER=openai` + `OPENAI_API_KEY`) |
| Google Calendar / OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |

## Документация

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — архитектура, модули, формулы аналитики, XP, SM-2, напоминания
- [docs/DATABASE.md](docs/DATABASE.md) — схема (69 таблиц), ограничения, миграции
- [docs/API.md](docs/API.md) — все эндпоинты `/api/v1`
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — структура кода, как добавить модуль
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — развёртывание на сервере, HTTPS, бэкапы
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) — Google Calendar, Apple iCloud, импорт из Google Keep и Apple Notes, AI (Gemini)
- [docs/SECURITY.md](docs/SECURITY.md) — модель безопасности
- [docs/TESTING.md](docs/TESTING.md) — тесты и что они покрывают
- [docs/STATUS.md](docs/STATUS.md) — проверенные критерии приёмки и известные ограничения
