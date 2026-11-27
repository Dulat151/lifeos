from app.core.db import SessionLocal
from app.services.calendar_sync import sync_all
from app.services.finance import process_due_subscriptions
from app.services.reminders import dispatch_due, process_deliveries
from app.workers.celery_app import celery_app


@celery_app.task
def run_reminder_cycle() -> dict:
    with SessionLocal() as db:
        created = dispatch_due(db)
        stats = process_deliveries(db)
    return {"notifications_created": created, **stats}


@celery_app.task
def run_subscription_cycle() -> int:
    with SessionLocal() as db:
        return process_due_subscriptions(db)


@celery_app.task
def run_calendar_sync() -> dict:
    return sync_all(SessionLocal)
