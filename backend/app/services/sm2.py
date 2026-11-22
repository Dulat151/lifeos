"""SuperMemo SM-2 (Wozniak, 1990).

grade q in 0..5
  q < 3  -> repetitions = 0, interval = 1 (card relearned), lapses += 1
  q >= 3 -> repetitions += 1; interval = 1 (rep 1), 6 (rep 2), round(prev_interval * EF) afterwards
  EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)), min 1.3 (EF updated for every grade)
"""
from dataclasses import dataclass
from datetime import date, timedelta


@dataclass
class SM2State:
    ease_factor: float = 2.5
    interval_days: int = 0
    repetitions: int = 0
    lapses: int = 0


def review(state: SM2State, grade: int, today: date) -> tuple[SM2State, date]:
    if not 0 <= grade <= 5:
        raise ValueError("grade must be 0..5")
    ef = state.ease_factor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
    ef = max(1.3, round(ef, 4))
    if grade < 3:
        reps, interval, lapses = 0, 1, state.lapses + 1
    else:
        reps = state.repetitions + 1
        if reps == 1:
            interval = 1
        elif reps == 2:
            interval = 6
        else:
            interval = max(1, round(state.interval_days * ef))
        lapses = state.lapses
    new = SM2State(ease_factor=ef, interval_days=interval, repetitions=reps, lapses=lapses)
    return new, today + timedelta(days=interval)


def card_stage(repetitions: int, interval_days: int, due_date) -> str:
    """new | learning | review | mastered"""
    if due_date is None:
        return "new"
    if repetitions < 2:
        return "learning"
    if interval_days >= 21:
        return "mastered"
    return "review"
