"""RFC 5545 RRULE helpers. Recurrence is expanded in the item's own IANA time zone so that
wall-clock time stays stable across Daylight Saving Time transitions, then converted to UTC."""
from datetime import UTC, datetime

from dateutil.rrule import rrulestr

from app.core.time import safe_tz


def validate_rrule(rule: str | None) -> str | None:
    if not rule:
        return None
    rule = rule.strip()
    if rule.upper().startswith("RRULE:"):
        rule = rule[6:]
    try:
        rrulestr(rule, dtstart=datetime(2020, 1, 1))
    except (ValueError, TypeError) as e:
        raise ValueError(f"Некорректное правило повторения: {e}") from e
    return rule


def occurrences(rule: str, dtstart_utc: datetime, tz: str, window_start: datetime, window_end: datetime,
                limit: int = 1000) -> list[datetime]:
    zone = safe_tz(tz)
    local_start = dtstart_utc.astimezone(zone).replace(tzinfo=None)
    rr = rrulestr(rule, dtstart=local_start)
    ws = window_start.astimezone(zone).replace(tzinfo=None)
    we = window_end.astimezone(zone).replace(tzinfo=None)
    out = []
    for dt in rr.between(ws, we, inc=True):
        out.append(dt.replace(tzinfo=zone).astimezone(UTC))
        if len(out) >= limit:
            break
    return out


def next_after(rule: str, dtstart_utc: datetime, tz: str, after_utc: datetime) -> datetime | None:
    zone = safe_tz(tz)
    rr = rrulestr(rule, dtstart=dtstart_utc.astimezone(zone).replace(tzinfo=None))
    nxt = rr.after(after_utc.astimezone(zone).replace(tzinfo=None), inc=False)
    return nxt.replace(tzinfo=zone).astimezone(UTC) if nxt else None
