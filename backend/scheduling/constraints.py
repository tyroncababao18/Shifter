from __future__ import annotations
from datetime import date
from .types import MemberState, ScheduleConfig


def check_gap(ms: MemberState, current: date, min_gap: int) -> bool:
    """Return True if member respects the minimum gap constraint."""
    if ms.last_assigned and (current - ms.last_assigned).days < min_gap:
        return False
    return True


def get_eligible(
    states: dict[int, MemberState],
    current_date: date,
    config: ScheduleConfig,
    unav_dict: dict[int, set],
    day_type: str,
) -> list[MemberState]:
    """Return members eligible for assignment on current_date."""
    eligible = []
    for ms in states.values():
        if current_date in unav_dict.get(ms.member_id, set()):
            continue
        if not check_gap(ms, current_date, config.min_gap):
            continue
        if day_type == "thursday" and ms.monthly_thursday >= config.max_thursday:
            continue
        if day_type == "weekend" and ms.monthly_weekend >= config.max_weekend:
            continue
        if day_type == "normal" and ms.monthly_normal >= config.max_normal:
            continue
        eligible.append(ms)
    return eligible


def build_suggestion_info(
    states: dict[int, MemberState],
    d: date,
    unav_dict: dict[int, set],
    reason_dict: dict,
    config: ScheduleConfig,
):
    """Return (unavailable_members, optional_members) for a date with no eligible member."""
    unavailable = []
    optional = []
    for ms in states.values():
        reasons = []
        if d in unav_dict.get(ms.member_id, set()):
            reasons.append(reason_dict.get((ms.member_id, d), "Marked unavailable"))
        else:
            if ms.last_assigned and (d - ms.last_assigned).days < config.min_gap:
                reasons.append(f"Min gap not met ({config.min_gap} day{'s' if config.min_gap != 1 else ''})")
            if d.weekday() == 3 and ms.monthly_thursday >= config.max_thursday:
                reasons.append(f"Reached max Thursday shifts ({config.max_thursday})")
            if d.weekday() in (4, 5) and ms.monthly_weekend >= config.max_weekend:
                reasons.append(f"Reached max weekend shifts ({config.max_weekend})")
            if d.weekday() not in (3, 4, 5) and ms.monthly_normal >= config.max_normal:
                reasons.append(f"Reached max normal shifts ({config.max_normal})")
            if not reasons:
                reasons.append("Unknown constraint")

        unavailable.append({"member_name": ms.name, "reason": "; ".join(reasons)})
        optional.append({
            "member_name": ms.name,
            "shift_count": ms.past_count,
            "reason": "; ".join(reasons),
        })

    optional.sort(key=lambda x: x["shift_count"])
    return unavailable, optional


def enforce_minimum_participation(
    dates: list[date],
    states: dict[int, MemberState],
    config: ScheduleConfig,
    unav_dict: dict[int, set],
) -> dict[date, int]:
    """Pre-assign dates to members who might not meet minimum participation.
    Returns dict of date -> member_id for pre-assigned slots."""
    if config.min_shifts <= 0:
        return {}

    pre_assignments: dict[date, int] = {}
    # Sort members by available_days ascending (most constrained first)
    constrained = sorted(states.values(), key=lambda ms: ms.available_days)

    for ms in constrained:
        current_total = ms.monthly_sum
        needed = max(0, config.min_shifts - current_total)
        if needed == 0:
            continue
        for d in dates:
            if needed <= 0:
                break
            if d in pre_assignments:
                continue
            if d in unav_dict.get(ms.member_id, set()):
                continue
            pre_assignments[d] = ms.member_id
            needed -= 1

    return pre_assignments
