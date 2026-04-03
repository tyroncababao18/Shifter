"""Scheduling package — extracted and enhanced shift assignment algorithm."""

from __future__ import annotations
import random
from datetime import date, datetime, timedelta
from calendar import monthrange

from sqlalchemy import extract

from models import db, Member, Shift, ShiftSwap, Unavailability
from .types import MemberState, ScheduleConfig
from .fairness import get_sort_fn
from .constraints import get_eligible, build_suggestion_info, enforce_minimum_participation
from .rebalancer import rebalance


def _get_setting(team_id, key, settings_dict):
    return settings_dict.get(key, "0")


def create_schedule(team_id, year, month, get_all_settings_fn=None):
    """Generate a monthly shift schedule for a team.

    This is the main entry point, called from the route handler.
    Signature is backwards-compatible with the original inline function.
    """
    # Import here to avoid circular imports
    if get_all_settings_fn is None:
        from app import get_all_settings
        get_all_settings_fn = get_all_settings

    all_settings = get_all_settings_fn(team_id)

    all_members = Member.query.filter_by(team_id=team_id).all()
    members = [m for m in all_members if not m.is_leader]
    member_ids = [m.id for m in members]

    active_days_str = all_settings.get("active_days", "0,1,2,3,4,5,6")
    active_days = set(int(x) for x in active_days_str.split(",") if x.strip())

    config = ScheduleConfig(
        max_normal=int(all_settings.get("max_normal_shifts", "6")),
        max_thursday=int(all_settings.get("max_thursday_shifts", "1")),
        max_weekend=int(all_settings.get("max_weekend_shifts", "1")),
        min_gap=int(all_settings.get("min_days_between_shifts", "1")),
        lookback_months=int(all_settings.get("justice_lookback_months", "0")),
        fairness_mode=all_settings.get("fairness_mode", "count"),
        min_shifts=int(all_settings.get("min_shifts_per_month", "0")),
        enable_rebalancing=all_settings.get("enable_rebalancing", "false") == "true",
        active_days=active_days,
    )

    _, last_day = monthrange(year, month)
    end_date = date(year, month, last_day)

    today = date.today()
    is_current_month = (year == today.year and month == today.month)
    gen_start = today if is_current_month else date(year, month, 1)

    # Delete existing shifts for this period
    Shift.query.filter(
        Shift.member_id.in_(member_ids),
        Shift.shift_date >= gen_start,
        Shift.shift_date <= end_date,
    ).delete(synchronize_session="fetch")
    db.session.flush()

    # Load unavailabilities
    unav_dict: dict[int, set] = {m.id: set() for m in members}
    reason_dict: dict = {}
    all_unav = Unavailability.query.filter(
        Unavailability.member_id.in_(member_ids),
        extract("year", Unavailability.date) == year,
        extract("month", Unavailability.date) == month,
    ).all()
    for ua in all_unav:
        unav_dict[ua.member_id].add(ua.date)
        reason_dict[(ua.member_id, ua.date)] = ua.reason

    # ── Justice computation with shift_credit + swap debt ──
    cutoff = None
    if config.lookback_months > 0:
        cutoff = date(year, month, 1) - timedelta(days=config.lookback_months * 30)

    states: dict[int, MemberState] = {}

    for m in members:
        base_q = Shift.query.filter(
            Shift.member_id == m.id,
            ~((extract("year", Shift.shift_date) == year) & (extract("month", Shift.shift_date) == month)),
        )
        if cutoff:
            base_q = base_q.filter(Shift.shift_date >= cutoff)

        total = base_q.count()
        all_shifts = base_q.all()
        weekend_shifts = [s for s in all_shifts if s.shift_date.weekday() in (4, 5)]
        thursday_shifts = [s for s in all_shifts if s.shift_date.weekday() == 3]

        swap_q = ShiftSwap.query
        if cutoff:
            swap_q_covers = swap_q.join(Shift).filter(Shift.shift_date >= cutoff)
        else:
            swap_q_covers = swap_q

        covers_done = swap_q_covers.filter(ShiftSwap.covering_member_id == m.id).count()
        covers_received = swap_q_covers.filter(ShiftSwap.original_member_id == m.id).count()

        effective = total - covers_done + covers_received + m.shift_credit

        # Count available days in this month (only active days)
        active_days_in_range = sum(
            1 for day_num in range(gen_start.day, last_day + 1)
            if date(year, month, day_num).weekday() in config.active_days
        )
        unavailable_count = len([
            d for d in unav_dict[m.id]
            if d >= gen_start and d.weekday() in config.active_days
        ])
        available_days = max(1, active_days_in_range - unavailable_count)

        states[m.id] = MemberState(
            member_id=m.id,
            name=m.name,
            past_count=effective,
            past_weekend=len(weekend_shifts),
            past_thursday=len(thursday_shifts),
            available_days=available_days,
            weight=getattr(m, "shift_weight", 1.0),
        )

    # Select sort function based on fairness mode
    sort_fn = get_sort_fn(config.fairness_mode)

    # Build list of all dates to schedule (only active days)
    all_dates = []
    d = gen_start
    while d.month == month:
        if d.weekday() in config.active_days:
            all_dates.append(d)
        d += timedelta(days=1)

    # Minimum participation pre-pass
    pre_assignments = enforce_minimum_participation(all_dates, states, config, unav_dict)

    # ── Main greedy assignment loop ──
    current_date = gen_start
    assignments: list[dict] = []
    suggestions: list[dict] = []
    name_to_id = {m.name: m.id for m in members}

    while current_date.month == month:
        # Skip inactive days
        if current_date.weekday() not in config.active_days:
            current_date += timedelta(days=1)
            continue

        if any(a["date"] == current_date.isoformat() for a in assignments):
            current_date += timedelta(days=1)
            continue

        day_name = current_date.strftime("%A")

        # Check if this date was pre-assigned by minimum participation
        if current_date in pre_assignments:
            pre_mid = pre_assignments[current_date]
            ms = states[pre_mid]
            assignments.append({"date": current_date.isoformat(), "day_of_week": day_name, "member_name": ms.name})
            _update_counters(ms, current_date)
            current_date += timedelta(days=1)
            continue

        # ── Friday-Saturday pair ──
        if day_name == "Friday":
            next_day = current_date + timedelta(days=1)
            sat_active = 5 in config.active_days  # Saturday weekday() == 5
            pair_in_month = next_day.month == month and sat_active

            potential = [
                states[m.id] for m in members
                if current_date not in unav_dict[m.id]
                and (not pair_in_month or next_day not in unav_dict[m.id])
                and states[m.id].monthly_weekend < config.max_weekend
                and _check_gap(states[m.id], current_date, config.min_gap)
            ]

            if not potential:
                fri_unav, fri_opt = build_suggestion_info(states, current_date, unav_dict, reason_dict, config)
                suggestions.append({
                    "date": current_date.isoformat(),
                    "day_of_week": "Friday",
                    "unavailable_members": fri_unav,
                    "optional_members": fri_opt,
                })
                assignments.append({"date": current_date.isoformat(), "day_of_week": "Friday", "member_name": "No one available"})
                if pair_in_month:
                    sat_unav, sat_opt = build_suggestion_info(states, next_day, unav_dict, reason_dict, config)
                    suggestions.append({
                        "date": next_day.isoformat(),
                        "day_of_week": "Saturday",
                        "unavailable_members": sat_unav,
                        "optional_members": sat_opt,
                    })
                    assignments.append({"date": next_day.isoformat(), "day_of_week": "Saturday", "member_name": "No one available"})
            else:
                potential.sort(key=lambda ms: sort_fn(ms, "weekend"))
                chosen = potential[0]
                assignments.append({"date": current_date.isoformat(), "day_of_week": "Friday", "member_name": chosen.name})
                if pair_in_month:
                    assignments.append({"date": next_day.isoformat(), "day_of_week": "Saturday", "member_name": chosen.name})
                    chosen.past_count += 2
                    chosen.past_weekend += 1
                    chosen.monthly_weekend += 1
                    chosen.last_assigned = next_day
                else:
                    chosen.past_count += 1
                    chosen.past_weekend += 1
                    chosen.monthly_weekend += 1
                    chosen.last_assigned = current_date

            current_date = (next_day if pair_in_month else current_date) + timedelta(days=1)
            continue

        # ── Saturday at start of month ──
        if current_date.day == 1 and day_name == "Saturday":
            prev_friday = current_date - timedelta(days=1)
            friday_shift = (
                Shift.query.join(Member)
                .filter(Member.team_id == team_id, Shift.shift_date == prev_friday)
                .first()
            )
            if friday_shift:
                member = Member.query.get(friday_shift.member_id)
                if (
                    member
                    and current_date not in unav_dict.get(member.id, set())
                    and states.get(member.id, MemberState(0, "", 0, 0, 0, 1, 1.0)).monthly_weekend < config.max_weekend
                ):
                    ms = states.get(member.id)
                    if ms:
                        assignments.append({"date": current_date.isoformat(), "day_of_week": "Saturday", "member_name": member.name})
                        ms.monthly_weekend += 1
                        ms.past_count += 1
                        ms.past_weekend += 1
                        ms.last_assigned = current_date
                        current_date += timedelta(days=1)
                        continue

        # ── Normal days (Sun-Thu) or unhandled Saturday ──
        day_type = "thursday" if current_date.weekday() == 3 else ("weekend" if current_date.weekday() in (4, 5) else "normal")
        eligible = get_eligible(states, current_date, config, unav_dict, day_type)

        if not eligible:
            day_unav, day_opt = build_suggestion_info(states, current_date, unav_dict, reason_dict, config)
            suggestions.append({
                "date": current_date.isoformat(),
                "day_of_week": day_name,
                "unavailable_members": day_unav,
                "optional_members": day_opt,
            })
            assignments.append({"date": current_date.isoformat(), "day_of_week": day_name, "member_name": "No one available"})
        else:
            eligible.sort(key=lambda ms: sort_fn(ms, day_type))
            chosen = eligible[0]
            assignments.append({"date": current_date.isoformat(), "day_of_week": day_name, "member_name": chosen.name})
            _update_counters(chosen, current_date)

        current_date += timedelta(days=1)

    # ── Rebalancing pass ──
    if config.enable_rebalancing:
        assignments = rebalance(assignments, states, config, unav_dict, name_to_id)

    # ── Persist ──
    for a in assignments:
        if a["member_name"] != "No one available":
            dt = datetime.strptime(a["date"], "%Y-%m-%d").date()
            member_obj = Member.query.filter_by(team_id=team_id, name=a["member_name"]).first()
            if member_obj:
                db.session.add(Shift(shift_date=dt, member_id=member_obj.id))
    db.session.commit()

    return assignments, suggestions


def _check_gap(ms: MemberState, current: date, min_gap: int) -> bool:
    if ms.last_assigned and (current - ms.last_assigned).days < min_gap:
        return False
    return True


def _update_counters(ms: MemberState, d: date):
    """Update member state counters after assignment."""
    if d.weekday() == 3:
        ms.monthly_thursday += 1
        ms.past_thursday += 1
    elif d.weekday() in (4, 5):
        ms.monthly_weekend += 1
        ms.past_weekend += 1
    else:
        ms.monthly_normal += 1
    ms.past_count += 1
    ms.last_assigned = d
