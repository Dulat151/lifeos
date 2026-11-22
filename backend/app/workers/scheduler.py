"""Lightweight alternative to Celery beat for single-host deployments:
    python -m app.workers.scheduler
Runs the same cycles as the Celery tasks. Multiple instances are safe (row locks with SKIP LOCKED)."""
import logging
import time

from app.core.db import SessionLocal
from app.services.finance import process_due_subscriptions
from app.services.reminders import dispatch_due, process_deliveries

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("lifeos.scheduler")


def main(interval: int = 30) -> None:
    log.info("Scheduler started, interval=%ss", interval)
    last_subs = 0.0
    while True:
        try:
            with SessionLocal() as db:
                created = dispatch_due(db)
                stats = process_deliveries(db)
                if time.time() - last_subs > 3600:
                    process_due_subscriptions(db)
                    last_subs = time.time()
            if created or any(stats.values()):
                log.info("cycle: created=%s %s", created, stats)
        except Exception:  # noqa: BLE001
            log.exception("Scheduler cycle failed")
        time.sleep(interval)


if __name__ == "__main__":
    main()
