from celery import Celery

from app.core.config import settings

celery_app = Celery("lifeos", broker=settings.redis_url, backend=settings.redis_url, include=["app.workers.tasks"])
celery_app.conf.update(
    timezone="UTC",
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "dispatch-reminders": {"task": "app.workers.tasks.run_reminder_cycle", "schedule": 30.0},
        "generate-recurring-payments": {"task": "app.workers.tasks.run_subscription_cycle", "schedule": 3600.0},
    },
)
