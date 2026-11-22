.PHONY: up down logs migrate test test-backend test-frontend e2e backup dev-api dev-web dev-scheduler

up:            ## build and start the full stack
	docker compose up -d --build
down:
	docker compose down
logs:
	docker compose logs -f --tail=100
migrate:       ## apply database migrations
	docker compose run --rm migrate
backup:
	./scripts/backup.sh

dev-api:       ## local API with auto-reload (needs local PostgreSQL + Redis)
	cd backend && alembic upgrade head && uvicorn app.main:app --reload --port 8000
dev-scheduler: ## reminder engine without Celery
	cd backend && python -m app.workers.scheduler
dev-web:
	cd frontend && npm run dev

test: test-backend test-frontend
test-backend:
	cd backend && pytest -q
test-frontend:
	cd frontend && npm run lint && npm test
e2e:           ## requires running stack on :3000
	cd frontend && npx playwright test
