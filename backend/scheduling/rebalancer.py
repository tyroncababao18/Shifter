from __future__ import annotations
from datetime import date
from .types import MemberState, ScheduleConfig


def _compute_burden(ms: MemberState) -> float:
    """Compute burden ratio for a member: weighted_shifts / available_days."""
    total = ms.past_count + ms.monthly_sum
    weighted = total / ms.weight if ms.weight > 0 else float("inf")
    return weighted / ms.available_days if ms.available_days > 0 else float("inf")


def _can_assign(ms: MemberState, d: date, config: ScheduleConfig, unav_dict: dict[int, set]) -> bool:
    """Check if member can take a shift on date d (availability + caps + gap)."""
    if d.weekday() not in config.active_days:
        return False
    if d in unav_dict.get(ms.member_id, set()):
        return False
    if ms.last_assigned and (d - ms.last_assigned).days < config.min_gap:
        return False
    day_type = _day_type(d)
    if day_type == "thursday" and ms.monthly_thursday >= config.max_thursday:
        return False
    if day_type == "weekend" and ms.monthly_weekend >= config.max_weekend:
        return False
    if day_type == "normal" and ms.monthly_normal >= config.max_normal:
        return False
    return True


def _day_type(d: date) -> str:
    if d.weekday() == 3:
        return "thursday"
    if d.weekday() in (4, 5):
        return "weekend"
    return "normal"


def _increment_counters(ms: MemberState, d: date):
    dt = _day_type(d)
    if dt == "thursday":
        ms.monthly_thursday += 1
    elif dt == "weekend":
        ms.monthly_weekend += 1
    else:
        ms.monthly_normal += 1
    ms.past_count += 1


def _decrement_counters(ms: MemberState, d: date):
    dt = _day_type(d)
    if dt == "thursday":
        ms.monthly_thursday -= 1
    elif dt == "weekend":
        ms.monthly_weekend -= 1
    else:
        ms.monthly_normal -= 1
    ms.past_count -= 1


def rebalance(
    assignments: list[dict],
    states: dict[int, MemberState],
    config: ScheduleConfig,
    unav_dict: dict[int, set],
    name_to_id: dict[str, int],
) -> list[dict]:
    """Second pass: swap assignments between most-burdened and least-burdened members
    to reduce fairness spread. Only runs when enable_rebalancing is True."""
    MAX_ITERATIONS = 50
    THRESHOLD = 0.1

    for _ in range(MAX_ITERATIONS):
        burdens = {mid: _compute_burden(ms) for mid, ms in states.items()
                    if ms.available_days > 0}
        if len(burdens) < 2:
            break

        most_id = max(burdens, key=burdens.get)
        least_id = min(burdens, key=burdens.get)
        spread = burdens[most_id] - burdens[least_id]
        if spread < THRESHOLD:
            break

        # Try to find an assignment from most_burdened that can go to least_burdened
        swapped = False
        for a in assignments:
            if a["member_name"] == "No one available":
                continue
            mid = name_to_id.get(a["member_name"])
            if mid != most_id:
                continue

            from datetime import datetime
            d = datetime.strptime(a["date"], "%Y-%m-%d").date()
            least_ms = states[least_id]

            if not _can_assign(least_ms, d, config, unav_dict):
                continue

            # Check if swap improves spread
            most_ms = states[most_id]
            _decrement_counters(most_ms, d)
            _increment_counters(least_ms, d)

            new_most_burden = _compute_burden(most_ms)
            new_least_burden = _compute_burden(least_ms)
            new_spread = abs(new_most_burden - new_least_burden)

            if new_spread < spread:
                # Accept the swap
                a["member_name"] = least_ms.name
                swapped = True
                break
            else:
                # Revert
                _increment_counters(most_ms, d)
                _decrement_counters(least_ms, d)

        if not swapped:
            break

    return assignments
