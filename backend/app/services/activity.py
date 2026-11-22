import uuid

from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import ActivityEvent


def log_event(db: Session, user_id: uuid.UUID, kind: str, entity_type: str, entity_id: uuid.UUID | None,
              data: dict | None = None) -> None:
    db.add(ActivityEvent(user_id=user_id, kind=kind, entity_type=entity_type, entity_id=entity_id,
                         data=data or {}, occurred_at=utcnow()))
