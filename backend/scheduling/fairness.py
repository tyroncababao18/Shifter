from __future__ import annotations
import random
from .types import MemberState


def sort_key_count(ms: MemberState, day_type: str) -> tuple:
    """Current behavior: sort by (type_count, past_count, monthly_sum, random).
    Lower values get assigned first."""
    if day_type == "weekend":
        type_count = ms.past_weekend
    elif day_type == "thursday":
        type_count = ms.past_thursday
    else:
        type_count = ms.past_count
    return (type_count, ms.past_count, ms.monthly_sum, random.random())


def sort_key_ratio(ms: MemberState, day_type: str) -> tuple:
    """Availability-weighted: burden = weighted_shifts / available_days.
    Accounts for member weight (0.5 = half load expected).
    Lower burden gets assigned first."""
    total_assigned = ms.past_count + ms.monthly_sum
    weighted_shifts = total_assigned / ms.weight if ms.weight > 0 else float("inf")
    burden = weighted_shifts / ms.available_days if ms.available_days > 0 else float("inf")

    if day_type == "weekend":
        type_count = ms.past_weekend
    elif day_type == "thursday":
        type_count = ms.past_thursday
    else:
        type_count = ms.past_count

    return (burden, type_count, random.random())


def get_sort_fn(mode: str):
    """Return the sort key function for the given fairness mode."""
    if mode == "ratio":
        return sort_key_ratio
    return sort_key_count
