"""Recurring payments: when a subscription's next_payment_on is reached, an expense transaction is created
once per period (dedup by subscription_id + date) and next_payment_on advances."""
from datetime import date

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Subscription, Transaction

STEP = {"weekly": relativedelta(weeks=1), "monthly": relativedelta(months=1), "yearly": relativedelta(years=1)}


def process_due_subscriptions(db: Session, today: date | None = None) -> int:
    today = today or date.today()
    count = 0
    subs = db.scalars(select(Subscription).where(Subscription.is_active.is_(True),
                                                 Subscription.next_payment_on <= today)
                      .with_for_update(skip_locked=True)).all()
    for s in subs:
        guard = 0
        while s.next_payment_on <= today and guard < 60:
            exists = db.scalar(select(Transaction.id).where(Transaction.subscription_id == s.id,
                                                            Transaction.occurred_on == s.next_payment_on))
            if not exists:
                db.add(Transaction(user_id=s.user_id, kind="expense", amount=s.amount, currency=s.currency,
                                   category=s.category, description=s.title, occurred_on=s.next_payment_on,
                                   subscription_id=s.id))
                count += 1
            s.next_payment_on = s.next_payment_on + STEP.get(s.period, STEP["monthly"])
            guard += 1
    db.commit()
    return count
