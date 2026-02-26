import logging
import os
import io
import random
from collections import defaultdict
from datetime import datetime, date, timedelta
from calendar import monthrange

from dotenv import load_dotenv
load_dotenv()

from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from sqlalchemy import extract, func
from sqlalchemy.orm import joinedload, subqueryload
from openpyxl import Workbook

from models import (
    db, Team, Member, Unavailability, Shift, ShiftSwap, Settings,
    ShotefDay, SETTINGS_DEFAULTS,
)

import time as _time

UPLOAD_FOLDER = "static/uploads"
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif"}

# Simple response cache (TTL-based, auto-cleared on writes)
_resp_cache: dict[str, tuple] = {}
CACHE_TTL = 5  # seconds

def _cache_get(key: str):
    if key in _resp_cache:
        val, ts = _resp_cache[key]
        if _time.time() - ts < CACHE_TTL:
            return val
        del _resp_cache[key]
    return None

def _cache_set(key: str, val):
    _resp_cache[key] = (val, _time.time())

def _cache_clear_team(team_id: int):
    for k in [k for k in _resp_cache if f"/teams/{team_id}/" in k or k.endswith(f"/teams/{team_id}")]:
        del _resp_cache[k]

def _cache_clear_all():
    _resp_cache.clear()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="../frontend/dist", static_url_path="/static-assets")

db_url = os.environ.get("DATABASE_URL", "sqlite:///shifter.db")
app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

if db_url.startswith("sqlite"):
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {}
else:
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_size": 5,
        "max_overflow": 10,
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "connect_args": {"options": "-c statement_timeout=10000"},
    }
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.secret_key = os.environ.get("SECRET_KEY", "superSecretKey")

CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.before_request
def _clear_per_request_caches():
    _settings_cache.clear()
    if request.method in ("POST", "PUT", "DELETE"):
        _cache_clear_all()

db.init_app(app)
with app.app_context():
    db.create_all()

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


_settings_cache: dict[tuple, dict] = {}

def get_all_settings(team_id=None):
    """Fetch all settings in one query, with team-level overrides."""
    cache_key = ("settings", team_id)
    if cache_key in _settings_cache:
        return _settings_cache[cache_key]

    result = dict(SETTINGS_DEFAULTS)
    global_rows = Settings.query.filter_by(team_id=None).all()
    for s in global_rows:
        result[s.key] = s.value
    if team_id is not None:
        team_rows = Settings.query.filter_by(team_id=team_id).all()
        for s in team_rows:
            result[s.key] = s.value
    _settings_cache[cache_key] = result
    return result

def get_setting(key, team_id=None):
    return get_all_settings(team_id).get(key, SETTINGS_DEFAULTS.get(key, "0"))

def invalidate_settings_cache():
    _settings_cache.clear()


def json_error(message, code=400):
    return jsonify({"error": message}), code


# ── Serve React app in production ──

@app.route("/")
def serve_react():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/assets/<path:filename>")
def serve_assets(filename):
    return send_from_directory(os.path.join(app.static_folder, "assets"), filename)


@app.errorhandler(404)
def spa_fallback(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return send_from_directory(app.static_folder, "index.html")


# ══════════════════════════════════════
#  TEAMS API
# ══════════════════════════════════════

@app.route("/api/teams", methods=["GET"])
def api_get_teams():
    cached = _cache_get("teams-list")
    if cached is not None:
        return jsonify(cached)
    teams = Team.query.order_by(Team.name).all()
    member_counts = dict(
        db.session.query(Member.team_id, func.count(Member.id))
        .group_by(Member.team_id).all()
    )
    total_members = sum(member_counts.values()) if member_counts else 0
    total_shifts = db.session.query(func.count(Shift.id)).scalar() or 0
    result = {
        "teams": [t.to_dict(member_count=member_counts.get(t.id, 0)) for t in teams],
        "stats": {
            "total_teams": len(teams),
            "total_members": total_members,
            "total_shifts": total_shifts,
        },
    }
    _cache_set("teams-list", result)
    return jsonify(result)


@app.route("/api/teams", methods=["POST"])
def api_create_team():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return json_error("Team name is required")
    if Team.query.filter_by(name=name).first():
        return json_error("Team name already exists")

    team = Team(name=name, description=data.get("description", ""))
    db.session.add(team)
    db.session.commit()
    return jsonify(team.to_dict()), 201


@app.route("/api/teams/<int:team_id>", methods=["GET"])
def api_get_team(team_id):
    team = Team.query.get_or_404(team_id)
    members = (
        Member.query
        .options(subqueryload(Member.unavailabilities))
        .filter_by(team_id=team_id).all()
    )
    shift_counts = dict(
        db.session.query(Shift.member_id, func.count(Shift.id))
        .filter(Shift.member_id.in_([m.id for m in members]))
        .group_by(Shift.member_id).all()
    ) if members else {}
    members_data = []
    for m in members:
        md = m.to_dict(shift_count=shift_counts.get(m.id, 0))
        md["unavailabilities"] = [u.to_dict() for u in m.unavailabilities]
        members_data.append(md)
    return jsonify({"team": team.to_dict(member_count=len(members)), "members": members_data})


@app.route("/api/teams/<int:team_id>", methods=["PUT"])
def api_update_team(team_id):
    team = Team.query.get_or_404(team_id)
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if name and name != team.name:
        if Team.query.filter_by(name=name).first():
            return json_error("Team name already exists")
        team.name = name
    if "description" in data:
        team.description = data["description"]
    db.session.commit()
    return jsonify(team.to_dict())


@app.route("/api/teams/<int:team_id>", methods=["DELETE"])
def api_delete_team(team_id):
    team = Team.query.get_or_404(team_id)
    db.session.delete(team)
    db.session.commit()
    return jsonify({"message": "Team deleted"})


@app.route("/api/teams/<int:team_id>/upload-picture", methods=["POST"])
def api_upload_team_picture(team_id):
    team = Team.query.get_or_404(team_id)
    pic = request.files.get("picture")
    if not pic or not allowed_file(pic.filename):
        return json_error("Invalid image file")
    filename = secure_filename(f"team_{team_id}_{pic.filename}")
    path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    pic.save(path)
    team.picture_url = "/" + path
    db.session.commit()
    return jsonify({"picture_url": team.picture_url})


# ══════════════════════════════════════
#  MEMBERS API
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/members", methods=["GET"])
def api_get_members(team_id):
    Team.query.get_or_404(team_id)
    members = (
        Member.query
        .options(subqueryload(Member.unavailabilities))
        .filter_by(team_id=team_id).all()
    )
    shift_counts = dict(
        db.session.query(Shift.member_id, func.count(Shift.id))
        .filter(Shift.member_id.in_([m.id for m in members]))
        .group_by(Shift.member_id).all()
    ) if members else {}
    result = []
    for m in members:
        md = m.to_dict(shift_count=shift_counts.get(m.id, 0))
        md["unavailabilities"] = [u.to_dict() for u in m.unavailabilities]
        result.append(md)
    return jsonify({"members": result})


@app.route("/api/teams/<int:team_id>/members", methods=["POST"])
def api_create_member(team_id):
    Team.query.get_or_404(team_id)
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return json_error("Member name is required")
    if Member.query.filter_by(team_id=team_id, name=name).first():
        return json_error("Member name already exists in this team")

    existing_members = Member.query.filter_by(team_id=team_id).all()
    credit = 0
    if existing_members:
        lookback = int(get_setting("justice_lookback_months", team_id))
        counts = []
        for m in existing_members:
            q = Shift.query.filter_by(member_id=m.id)
            if lookback > 0:
                cutoff = date.today() - timedelta(days=lookback * 30)
                q = q.filter(Shift.shift_date >= cutoff)
            counts.append(q.count() + m.shift_credit)
        credit = min(counts) if counts else 0

    member = Member(
        team_id=team_id,
        name=name,
        sleeps_in_building=data.get("sleeps_in_building", False),
        is_leader=data.get("is_leader", False),
        shift_credit=credit,
    )
    db.session.add(member)
    db.session.commit()
    return jsonify(member.to_dict()), 201


@app.route("/api/members/<int:member_id>", methods=["PUT"])
def api_update_member(member_id):
    member = Member.query.get_or_404(member_id)
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if name and name != member.name:
        if Member.query.filter_by(team_id=member.team_id, name=name).first():
            return json_error("Member name already exists in this team")
        member.name = name
    if "sleeps_in_building" in data:
        member.sleeps_in_building = bool(data["sleeps_in_building"])
    if "is_leader" in data:
        member.is_leader = bool(data["is_leader"])
    if "shift_credit" in data:
        member.shift_credit = int(data["shift_credit"])
    if "shotef_credit" in data:
        member.shotef_credit = int(data["shotef_credit"])
    db.session.commit()
    return jsonify(member.to_dict())


@app.route("/api/members/<int:member_id>", methods=["DELETE"])
def api_delete_member(member_id):
    member = Member.query.get_or_404(member_id)
    db.session.delete(member)
    db.session.commit()
    return jsonify({"message": "Member deleted"})


@app.route("/api/members/<int:member_id>/upload-photo", methods=["POST"])
def api_upload_member_photo(member_id):
    member = Member.query.get_or_404(member_id)
    photo = request.files.get("photo")
    if not photo or not allowed_file(photo.filename):
        return json_error("Invalid image file")
    filename = secure_filename(f"member_{member_id}_{photo.filename}")
    path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    photo.save(path)
    member.photo_url = "/" + path
    db.session.commit()
    return jsonify({"photo_url": member.photo_url})


# ══════════════════════════════════════
#  UNAVAILABILITIES API
# ══════════════════════════════════════

@app.route("/api/members/<int:member_id>/unavailabilities", methods=["GET"])
def api_get_unavailabilities(member_id):
    Member.query.get_or_404(member_id)
    unavs = Unavailability.query.filter_by(member_id=member_id).order_by(Unavailability.date).all()
    return jsonify({"unavailabilities": [u.to_dict() for u in unavs]})


@app.route("/api/members/<int:member_id>/unavailabilities", methods=["POST"])
def api_create_unavailability(member_id):
    Member.query.get_or_404(member_id)
    data = request.get_json() or {}
    date_str = data.get("date", "")
    if not date_str:
        return json_error("Date is required")
    try:
        d_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return json_error("Invalid date format, use YYYY-MM-DD")

    existing = Unavailability.query.filter_by(member_id=member_id, date=d_obj).first()
    if existing:
        existing.reason = data.get("reason", "")
        db.session.commit()
        return jsonify(existing.to_dict())

    unav = Unavailability(member_id=member_id, date=d_obj, reason=data.get("reason", ""))
    db.session.add(unav)
    db.session.commit()
    return jsonify(unav.to_dict()), 201


@app.route("/api/members/<int:member_id>/unavailabilities/bulk", methods=["POST"])
def api_bulk_create_unavailability(member_id):
    """Create unavailabilities for multiple dates at once."""
    Member.query.get_or_404(member_id)
    data = request.get_json() or {}
    dates = data.get("dates", [])
    reason = data.get("reason", "")

    if not dates:
        return json_error("At least one date is required")

    added = 0
    for date_str in dates:
        try:
            d_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            continue
        existing = Unavailability.query.filter_by(member_id=member_id, date=d_obj).first()
        if existing:
            existing.reason = reason
        else:
            db.session.add(Unavailability(member_id=member_id, date=d_obj, reason=reason))
            added += 1
    db.session.commit()
    return jsonify({"message": f"{added} unavailabilit{'ies' if added != 1 else 'y'} added", "count": added}), 201


@app.route("/api/unavailabilities/<int:unav_id>", methods=["PUT"])
def api_update_unavailability(unav_id):
    unav = Unavailability.query.get_or_404(unav_id)
    data = request.get_json() or {}
    date_str = data.get("date", "")
    if date_str:
        try:
            new_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return json_error("Invalid date format")
        if new_date != unav.date:
            dup = Unavailability.query.filter_by(member_id=unav.member_id, date=new_date).first()
            if dup and dup.id != unav.id:
                return json_error("Unavailability already exists for that date")
            unav.date = new_date
    if "reason" in data:
        unav.reason = data["reason"]
    db.session.commit()
    return jsonify(unav.to_dict())


@app.route("/api/unavailabilities/<int:unav_id>", methods=["DELETE"])
def api_delete_unavailability(unav_id):
    unav = Unavailability.query.get_or_404(unav_id)
    db.session.delete(unav)
    db.session.commit()
    return jsonify({"message": "Unavailability deleted"})


# ══════════════════════════════════════
#  SHIFT SWAPS
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/schedule/swap", methods=["POST"])
def api_swap_shift(team_id):
    Team.query.get_or_404(team_id)
    data = request.get_json() or {}
    shift_id = data.get("shift_id")
    covering_member_id = data.get("covering_member_id")
    if not shift_id or not covering_member_id:
        return json_error("shift_id and covering_member_id are required")

    shift = Shift.query.get_or_404(shift_id)
    original_member = Member.query.get(shift.member_id)
    covering_member = Member.query.get_or_404(covering_member_id)

    if original_member and original_member.team_id != team_id:
        return json_error("Shift does not belong to this team")
    if covering_member.team_id != team_id:
        return json_error("Covering member does not belong to this team")
    if shift.member_id == covering_member_id:
        return json_error("Cannot swap with the same member")

    existing_swap = ShiftSwap.query.filter_by(shift_id=shift_id).first()
    if existing_swap:
        return json_error("This shift has already been swapped. Revert it first.")

    original_member_id = shift.member_id
    shift.member_id = covering_member_id
    swap = ShiftSwap(
        shift_id=shift_id,
        original_member_id=original_member_id,
        covering_member_id=covering_member_id,
    )
    db.session.add(swap)
    db.session.commit()

    return jsonify({"shift": shift.to_dict(), "swap": swap.to_dict()}), 201


@app.route("/api/swaps/<int:swap_id>", methods=["DELETE"])
def api_revert_swap(swap_id):
    swap = ShiftSwap.query.get_or_404(swap_id)
    shift = Shift.query.get(swap.shift_id)
    if shift:
        shift.member_id = swap.original_member_id
    db.session.delete(swap)
    db.session.commit()
    return jsonify({"message": "Swap reverted", "shift": shift.to_dict() if shift else None})


@app.route("/api/teams/<int:team_id>/swap-balance", methods=["GET"])
def api_swap_balance(team_id):
    Team.query.get_or_404(team_id)
    members = Member.query.filter_by(team_id=team_id).all()
    member_ids = [m.id for m in members]

    result = []
    for m in members:
        covers_done = ShiftSwap.query.filter(
            ShiftSwap.covering_member_id == m.id,
            ShiftSwap.original_member_id.in_(member_ids),
        ).count()
        covers_received = ShiftSwap.query.filter(
            ShiftSwap.original_member_id == m.id,
            ShiftSwap.covering_member_id.in_(member_ids),
        ).count()
        result.append({
            "member_id": m.id,
            "name": m.name,
            "covers_done": covers_done,
            "covers_received": covers_received,
            "net_balance": covers_received - covers_done,
        })

    return jsonify({"balances": result})


# ══════════════════════════════════════
#  SCHEDULE GENERATION
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/schedule/assign", methods=["POST"])
def api_assign_shift(team_id):
    """Manually assign a member to a specific date (used to fill 'no one available' slots)."""
    Team.query.get_or_404(team_id)
    data = request.get_json() or {}
    member_name = (data.get("member_name") or "").strip()
    shift_date_str = data.get("date")

    if not member_name or not shift_date_str:
        return json_error("member_name and date are required")

    try:
        d = datetime.strptime(shift_date_str, "%Y-%m-%d").date()
    except ValueError:
        return json_error("Invalid date format (expected YYYY-MM-DD)")

    member = Member.query.filter_by(team_id=team_id, name=member_name).first()
    if not member:
        return json_error(f"Member '{member_name}' not found in this team")

    existing = Shift.query.filter_by(member_id=member.id, shift_date=d).first()
    if existing:
        return json_error(f"{member_name} already has a shift on {shift_date_str}")

    db.session.add(Shift(shift_date=d, member_id=member.id))
    assigned_dates = [shift_date_str]

    paired_date = None
    if d.weekday() == 4:  # Friday -> also assign Saturday
        paired_date = d + timedelta(days=1)
    elif d.weekday() == 5:  # Saturday -> also assign Friday
        paired_date = d - timedelta(days=1)

    if paired_date and paired_date.month == d.month:
        paired_existing = Shift.query.filter_by(member_id=member.id, shift_date=paired_date).first()
        team_shift_on_paired = (
            Shift.query.join(Member)
            .filter(Member.team_id == team_id, Shift.shift_date == paired_date)
            .first()
        )
        if not paired_existing and not team_shift_on_paired:
            db.session.add(Shift(shift_date=paired_date, member_id=member.id))
            assigned_dates.append(paired_date.isoformat())

    db.session.commit()

    msg = f"{member_name} assigned to {', '.join(assigned_dates)}"
    return jsonify({"message": msg, "shift_date": shift_date_str, "member_name": member_name, "assigned_dates": assigned_dates}), 201


@app.route("/api/teams/<int:team_id>/schedule/generate", methods=["POST"])
def api_generate_schedule(team_id):
    try:
        Team.query.get_or_404(team_id)
        data = request.get_json() or {}
        year = data.get("year")
        month = data.get("month")

        if not year or not month:
            return json_error("Year and month are required")
        year, month = int(year), int(month)
        if not (1 <= month <= 12):
            return json_error("Month must be between 1 and 12")

        today = date.today()
        current_month_start = date(today.year, today.month, 1)
        target_month_start = date(year, month, 1)
        if target_month_start < current_month_start:
            return json_error("Cannot generate schedules for past months. Use 'Past Shifts' to add historical data.")

        members = Member.query.filter_by(team_id=team_id).all()
        if not members:
            return json_error("No members found for this team")

        assignments, suggestions = create_schedule(team_id, year, month)
        shotef_assignments, shotef_needs_substitute = generate_shotef(team_id, year, month)

        return jsonify({
            "assignments": assignments,
            "suggestions": suggestions,
            "shotef_assignments": shotef_assignments,
            "shotef_needs_substitute": shotef_needs_substitute,
        })
    except Exception as e:
        db.session.rollback()
        logger.exception("Schedule generation failed")
        return json_error(str(e), 500)


def create_schedule(team_id, year, month):
    all_members = Member.query.filter_by(team_id=team_id).all()
    members = [m for m in all_members if not m.is_leader]
    member_ids = [m.id for m in members]

    max_normal = int(get_setting("max_normal_shifts", team_id))
    max_thursday = int(get_setting("max_thursday_shifts", team_id))
    max_weekend = int(get_setting("max_weekend_shifts", team_id))
    lookback_months = int(get_setting("justice_lookback_months", team_id))
    min_gap = int(get_setting("min_days_between_shifts", team_id))

    _, last_day = monthrange(year, month)
    end_date = date(year, month, last_day)

    today = date.today()
    is_current_month = (year == today.year and month == today.month)
    gen_start = today if is_current_month else date(year, month, 1)

    Shift.query.filter(
        Shift.member_id.in_(member_ids),
        Shift.shift_date >= gen_start,
        Shift.shift_date <= end_date,
    ).delete(synchronize_session="fetch")
    db.session.flush()

    unav_dict = {m.id: set() for m in members}
    reason_dict = {}
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
    if lookback_months > 0:
        cutoff = date(year, month, 1) - timedelta(days=lookback_months * 30)

    member_past_count = {}
    member_past_weekend = {}
    member_past_thursday = {}

    for m in members:
        base_q = Shift.query.filter(
            Shift.member_id == m.id,
            ~((extract("year", Shift.shift_date) == year) & (extract("month", Shift.shift_date) == month)),
        )
        if cutoff:
            base_q = base_q.filter(Shift.shift_date >= cutoff)

        total = base_q.count()

        weekend_shifts = [s for s in base_q.all() if s.shift_date.weekday() in (4, 5)]
        thursday_shifts = [s for s in base_q.all() if s.shift_date.weekday() == 3]

        swap_q = ShiftSwap.query
        if cutoff:
            swap_q_covers = swap_q.join(Shift).filter(Shift.shift_date >= cutoff)
        else:
            swap_q_covers = swap_q

        covers_done = swap_q_covers.filter(ShiftSwap.covering_member_id == m.id).count()
        covers_received = swap_q_covers.filter(ShiftSwap.original_member_id == m.id).count()

        effective = total - covers_done + covers_received + m.shift_credit
        member_past_count[m.id] = effective
        member_past_weekend[m.id] = len(weekend_shifts)
        member_past_thursday[m.id] = len(thursday_shifts)

    monthly_normal_count = defaultdict(int)
    monthly_thursday_count = defaultdict(int)
    monthly_weekend_count = defaultdict(int)
    last_assignment_date: dict[int, date] = {}

    def is_thursday(d):
        return d.weekday() == 3

    def is_weekend(d):
        return d.weekday() in (4, 5)

    def sort_key_for_type(m, day_type):
        if day_type == "weekend":
            type_count = member_past_weekend[m.id]
        elif day_type == "thursday":
            type_count = member_past_thursday[m.id]
        else:
            type_count = member_past_count[m.id]
        monthly_sum = monthly_normal_count[m.id] + monthly_thursday_count[m.id] + monthly_weekend_count[m.id]
        return (type_count, member_past_count[m.id], monthly_sum, random.random())

    def check_gap(m_id, current):
        last = last_assignment_date.get(m_id)
        if last and (current - last).days < min_gap:
            return False
        return True

    current_date = gen_start
    assignments = []
    suggestions = []

    while current_date.month == month:
        if any(a["date"] == current_date.isoformat() for a in assignments):
            current_date += timedelta(days=1)
            continue

        day_name = current_date.strftime("%A")

        # ── Friday-Saturday pair ──
        if day_name == "Friday":
            next_day = current_date + timedelta(days=1)
            pair_in_month = next_day.month == month

            potential = [
                m for m in members
                if current_date not in unav_dict[m.id]
                and (not pair_in_month or next_day not in unav_dict[m.id])
                and monthly_weekend_count[m.id] < max_weekend
                and check_gap(m.id, current_date)
            ]

            if not potential:
                fri_unav, fri_opt = _build_suggestion_info(
                    members, current_date, unav_dict, reason_dict,
                    monthly_normal_count, monthly_thursday_count, monthly_weekend_count,
                    max_normal, max_thursday, max_weekend,
                    member_past_count, last_assignment_date, min_gap,
                )
                suggestions.append({
                    "date": current_date.isoformat(),
                    "day_of_week": "Friday",
                    "unavailable_members": fri_unav,
                    "optional_members": fri_opt,
                })
                assignments.append({"date": current_date.isoformat(), "day_of_week": "Friday", "member_name": "No one available"})
                if pair_in_month:
                    sat_unav, sat_opt = _build_suggestion_info(
                        members, next_day, unav_dict, reason_dict,
                        monthly_normal_count, monthly_thursday_count, monthly_weekend_count,
                        max_normal, max_thursday, max_weekend,
                        member_past_count, last_assignment_date, min_gap,
                    )
                    suggestions.append({
                        "date": next_day.isoformat(),
                        "day_of_week": "Saturday",
                        "unavailable_members": sat_unav,
                        "optional_members": sat_opt,
                    })
                    assignments.append({"date": next_day.isoformat(), "day_of_week": "Saturday", "member_name": "No one available"})
            else:
                potential.sort(key=lambda m: sort_key_for_type(m, "weekend"))
                chosen = potential[0]
                assignments.append({"date": current_date.isoformat(), "day_of_week": "Friday", "member_name": chosen.name})
                if pair_in_month:
                    assignments.append({"date": next_day.isoformat(), "day_of_week": "Saturday", "member_name": chosen.name})
                    member_past_count[chosen.id] += 2
                    member_past_weekend[chosen.id] += 1
                    monthly_weekend_count[chosen.id] += 1
                    last_assignment_date[chosen.id] = next_day
                else:
                    member_past_count[chosen.id] += 1
                    member_past_weekend[chosen.id] += 1
                    monthly_weekend_count[chosen.id] += 1
                    last_assignment_date[chosen.id] = current_date

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
                    and monthly_weekend_count.get(member.id, 0) < max_weekend
                ):
                    assignments.append({"date": current_date.isoformat(), "day_of_week": "Saturday", "member_name": member.name})
                    monthly_weekend_count[member.id] += 1
                    member_past_count[member.id] = member_past_count.get(member.id, 0) + 1
                    member_past_weekend[member.id] = member_past_weekend.get(member.id, 0) + 1
                    last_assignment_date[member.id] = current_date
                    current_date += timedelta(days=1)
                    continue

        # ── Normal days (Sun-Thu) or unhandled Saturday ──
        day_type = "thursday" if is_thursday(current_date) else ("weekend" if is_weekend(current_date) else "normal")
        potential = []
        for m in members:
            if current_date in unav_dict[m.id]:
                continue
            if not check_gap(m.id, current_date):
                continue
            if is_thursday(current_date) and monthly_thursday_count[m.id] >= max_thursday:
                continue
            if not is_weekend(current_date) and not is_thursday(current_date) and monthly_normal_count[m.id] >= max_normal:
                continue
            potential.append(m)

        if not potential:
            day_unav, day_opt = _build_suggestion_info(
                members, current_date, unav_dict, reason_dict,
                monthly_normal_count, monthly_thursday_count, monthly_weekend_count,
                max_normal, max_thursday, max_weekend,
                member_past_count, last_assignment_date, min_gap,
            )
            suggestions.append({
                "date": current_date.isoformat(),
                "day_of_week": day_name,
                "unavailable_members": day_unav,
                "optional_members": day_opt,
            })
            assignments.append({"date": current_date.isoformat(), "day_of_week": day_name, "member_name": "No one available"})
        else:
            potential.sort(key=lambda m: sort_key_for_type(m, day_type))
            chosen = potential[0]
            assignments.append({"date": current_date.isoformat(), "day_of_week": day_name, "member_name": chosen.name})
            if is_thursday(current_date):
                monthly_thursday_count[chosen.id] += 1
                member_past_thursday[chosen.id] += 1
            elif is_weekend(current_date):
                monthly_weekend_count[chosen.id] += 1
                member_past_weekend[chosen.id] += 1
            else:
                monthly_normal_count[chosen.id] += 1
            member_past_count[chosen.id] += 1
            last_assignment_date[chosen.id] = current_date

        current_date += timedelta(days=1)

    # Persist
    for a in assignments:
        if a["member_name"] != "No one available":
            dt = datetime.strptime(a["date"], "%Y-%m-%d").date()
            member_obj = Member.query.filter_by(team_id=team_id, name=a["member_name"]).first()
            if member_obj:
                db.session.add(Shift(shift_date=dt, member_id=member_obj.id))
    db.session.commit()

    return assignments, suggestions


def _build_suggestion_info(members, d, unav_dict, reason_dict,
                           m_normal, m_thursday, m_weekend,
                           max_normal, max_thursday, max_weekend,
                           member_past_count, last_assignment_date, min_gap):
    """Return (unavailable_members, optional_members) for a date with no eligible member."""
    unavailable = []
    optional = []
    for m in members:
        reasons = []
        if d in unav_dict[m.id]:
            reasons.append(reason_dict.get((m.id, d), "Marked unavailable"))
        else:
            last = last_assignment_date.get(m.id)
            if last and (d - last).days < min_gap:
                reasons.append(f"Min gap not met ({min_gap} day{'s' if min_gap != 1 else ''})")
            if d.weekday() == 3 and m_thursday[m.id] >= max_thursday:
                reasons.append(f"Reached max Thursday shifts ({max_thursday})")
            if d.weekday() in (4, 5) and m_weekend[m.id] >= max_weekend:
                reasons.append(f"Reached max weekend shifts ({max_weekend})")
            if d.weekday() not in (3, 4, 5) and m_normal[m.id] >= max_normal:
                reasons.append(f"Reached max normal shifts ({max_normal})")
            if not reasons:
                reasons.append("Unknown constraint")

        unavailable.append({"member_name": m.name, "reason": "; ".join(reasons)})
        optional.append({
            "member_name": m.name,
            "shift_count": member_past_count.get(m.id, 0),
            "reason": "; ".join(reasons),
        })

    optional.sort(key=lambda x: x["shift_count"])
    return unavailable, optional


# ══════════════════════════════════════
#  SHOTEF (DAY DUTY) GENERATION
# ══════════════════════════════════════

def _get_shotef_week_blocks(year, month):
    """Return list of (week_start_sunday, [days_in_month]) for Sun-Thu blocks."""
    _, last_day = monthrange(year, month)
    first = date(year, month, 1)
    last = date(year, month, last_day)

    blocks = []
    d = first
    while d <= last:
        wd = d.weekday()  # Mon=0 .. Sun=6
        if wd == 6:  # Sunday
            week_start = d
            days = []
            for offset in range(5):  # Sun-Thu
                day = d + timedelta(days=offset)
                if day.month == month and day <= last:
                    days.append(day)
            if days:
                blocks.append((week_start, days))
            d = d + timedelta(days=5)  # skip to Friday
        elif wd < 4:  # Mon-Thu at the start of the month (partial week)
            sun_before = d - timedelta(days=(wd + 1) % 7)
            days = []
            cursor = d
            while cursor.weekday() != 4 and cursor.month == month:
                days.append(cursor)
                cursor += timedelta(days=1)
            if cursor.weekday() == 4 and cursor.month == month:
                days.append(cursor)
            if days:
                blocks.append((sun_before, days))
            d = cursor + timedelta(days=1)
        else:
            d += timedelta(days=1)

    return blocks


def generate_shotef(team_id, year, month):
    """Generate Shotef (day duty) weekly rotation for a month using day-level assignments."""
    shotef_enabled = get_setting("shotef_enabled", team_id)
    if shotef_enabled.lower() != "true":
        return [], []

    all_members = Member.query.filter_by(team_id=team_id).all()
    members = [m for m in all_members if not m.is_leader]
    if not members:
        return [], []

    ShotefDay.query.filter_by(team_id=team_id, year=year, month=month).delete(synchronize_session="fetch")
    db.session.flush()

    lookback_months = int(get_setting("justice_lookback_months", team_id))
    settled_at_str = get_setting("shotef_settled_at", team_id)

    cutoff = None
    if settled_at_str:
        try:
            cutoff = datetime.strptime(settled_at_str, "%Y-%m-%d").date()
        except ValueError:
            pass
    if not cutoff and lookback_months > 0:
        cutoff = date(year, month, 1) - timedelta(days=lookback_months * 30)

    member_ids = [m.id for m in members]
    count_q = db.session.query(ShotefDay.member_id, func.count(ShotefDay.id)).filter(
        ShotefDay.member_id.in_(member_ids),
        ~((ShotefDay.year == year) & (ShotefDay.month == month)),
    )
    if cutoff:
        count_q = count_q.filter(ShotefDay.date >= cutoff)
    shotef_counts = dict(count_q.group_by(ShotefDay.member_id).all())
    for m in members:
        shotef_counts.setdefault(m.id, 0)
        shotef_counts[m.id] += m.shotef_credit

    unav_dict = {m.id: set() for m in members}
    reason_dict = {}
    all_unav = Unavailability.query.filter(
        Unavailability.member_id.in_(member_ids),
        extract("year", Unavailability.date) == year,
        extract("month", Unavailability.date) == month,
    ).all()
    for ua in all_unav:
        unav_dict[ua.member_id].add(ua.date)
        reason_dict[(ua.member_id, ua.date)] = ua.reason

    week_blocks = _get_shotef_week_blocks(year, month)

    shotef_assignments = []
    shotef_needs_substitute = []
    assigned_this_month = set()

    for week_start, days in week_blocks:
        eligible = [m for m in members if m.id not in assigned_this_month]
        if not eligible:
            eligible = list(members)

        eligible.sort(key=lambda m: (shotef_counts.get(m.id, 0), random.random()))
        chosen = eligible[0]
        assigned_this_month.add(chosen.id)

        created_days = []
        unavailable_days = []
        for d in days:
            sd = ShotefDay(team_id=team_id, member_id=chosen.id, date=d, year=year, month=month)
            db.session.add(sd)
            created_days.append(sd)
            if d in unav_dict[chosen.id]:
                unavailable_days.append(d)

        shotef_counts[chosen.id] = shotef_counts.get(chosen.id, 0) + len(days)

        shotef_assignments.append({
            "week_start": week_start.isoformat(),
            "member_name": chosen.name,
            "member_id": chosen.id,
            "days": [d.isoformat() for d in days],
            "unavailable_days": [d.isoformat() for d in unavailable_days],
        })

        for ud in unavailable_days:
            optional = []
            for m in members:
                if m.id == chosen.id:
                    continue
                optional.append({
                    "member_name": m.name,
                    "member_id": m.id,
                    "shotef_count": shotef_counts.get(m.id, 0),
                    "is_unavailable": ud in unav_dict[m.id],
                })
            optional.sort(key=lambda x: (x["is_unavailable"], x["shotef_count"], random.random()))
            shotef_needs_substitute.append({
                "member_name": chosen.name,
                "date": ud.isoformat(),
                "day_of_week": ud.strftime("%A"),
                "reason": reason_dict.get((chosen.id, ud), "Marked unavailable"),
                "optional_members": optional,
            })

    db.session.commit()
    return shotef_assignments, shotef_needs_substitute


# ══════════════════════════════════════
#  SCHEDULE VIEWING / DELETING / EXPORT
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/schedule", methods=["GET"])
def api_get_schedule(team_id):
    Team.query.get_or_404(team_id)
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    if not year or not month:
        return json_error("Year and month are required")

    shifts = (
        Shift.query.join(Member)
        .options(
            joinedload(Shift.member),
            subqueryload(Shift.swaps).joinedload(ShiftSwap.original_member),
        )
        .filter(Member.team_id == team_id)
        .filter(extract("year", Shift.shift_date) == year)
        .filter(extract("month", Shift.shift_date) == month)
        .order_by(Shift.shift_date)
        .all()
    )
    return jsonify({"shifts": [s.to_dict() for s in shifts]})


@app.route("/api/teams/<int:team_id>/schedule", methods=["DELETE"])
def api_delete_schedule(team_id):
    Team.query.get_or_404(team_id)
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    if not year or not month:
        return json_error("Year and month are required")

    start_dt = date(year, month, 1)
    end_dt = date(year, month, monthrange(year, month)[1])
    Shift.query.filter(
        Shift.member_id.in_([m.id for m in Member.query.filter_by(team_id=team_id).all()]),
        Shift.shift_date >= start_dt,
        Shift.shift_date <= end_dt,
    ).delete(synchronize_session="fetch")
    ShotefDay.query.filter_by(team_id=team_id, year=year, month=month).delete(synchronize_session="fetch")
    db.session.commit()
    return jsonify({"message": "Schedule deleted"})


@app.route("/api/teams/<int:team_id>/schedule/export", methods=["GET"])
def api_export_schedule(team_id):
    Team.query.get_or_404(team_id)
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    if not year or not month:
        return json_error("Year and month are required")

    shifts = (
        Shift.query.join(Member)
        .filter(Member.team_id == team_id)
        .filter(extract("year", Shift.shift_date) == year)
        .filter(extract("month", Shift.shift_date) == month)
        .order_by(Shift.shift_date)
        .all()
    )

    wb = Workbook()
    ws = wb.active
    ws.title = "Schedule"
    ws.append(["Date", "Day of Week", "Member Name"])
    for s in shifts:
        ws.append([
            s.shift_date.strftime("%Y-%m-%d"),
            s.shift_date.strftime("%A"),
            s.member.name if s.member else "Unknown",
        ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return send_file(
        buf,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=f"Schedule_{team_id}_{year}_{month}.xlsx",
    )


# ══════════════════════════════════════
#  COMBINED VIEW ENDPOINTS (perf)
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/schedule-view", methods=["GET"])
def api_schedule_view(team_id):
    """Combined endpoint: team + members + shifts + shotef for one month."""
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    if not year or not month:
        return json_error("Year and month are required")

    cache_key = f"/teams/{team_id}/schedule-view/{year}/{month}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)

    team = Team.query.get_or_404(team_id)

    members = (
        Member.query
        .options(subqueryload(Member.unavailabilities))
        .filter_by(team_id=team_id).all()
    )
    member_ids = [m.id for m in members]

    shift_counts = dict(
        db.session.query(Shift.member_id, func.count(Shift.id))
        .filter(Shift.member_id.in_(member_ids))
        .group_by(Shift.member_id).all()
    ) if member_ids else {}

    shifts = (
        Shift.query.join(Member)
        .options(
            joinedload(Shift.member),
            subqueryload(Shift.swaps).joinedload(ShiftSwap.original_member),
        )
        .filter(Member.team_id == team_id)
        .filter(extract("year", Shift.shift_date) == year)
        .filter(extract("month", Shift.shift_date) == month)
        .order_by(Shift.shift_date)
        .all()
    )

    shotef_days = (
        ShotefDay.query
        .options(joinedload(ShotefDay.member))
        .filter_by(team_id=team_id, year=year, month=month)
        .order_by(ShotefDay.date).all()
    )

    members_data = []
    for m in members:
        md = m.to_dict(shift_count=shift_counts.get(m.id, 0))
        md["unavailabilities"] = [u.to_dict() for u in m.unavailabilities]
        members_data.append(md)

    result = {
        "team": team.to_dict(member_count=len(members)),
        "members": members_data,
        "shifts": [s.to_dict() for s in shifts],
        "shotef_days": [d.to_dict() for d in shotef_days],
    }
    _cache_set(cache_key, result)
    return jsonify(result)


@app.route("/api/teams/<int:team_id>/past-shifts-view", methods=["GET"])
def api_past_shifts_view(team_id):
    """Combined endpoint: team + members + past shifts + shotef for one month."""
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    if not year or not month:
        return json_error("Year and month are required")

    cache_key = f"/teams/{team_id}/past-shifts-view/{year}/{month}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)

    team = Team.query.get_or_404(team_id)

    members = Member.query.filter_by(team_id=team_id).all()

    shifts_query = (
        Shift.query.join(Member)
        .options(
            joinedload(Shift.member),
            subqueryload(Shift.swaps).joinedload(ShiftSwap.original_member),
            subqueryload(Shift.swaps).joinedload(ShiftSwap.covering_member),
        )
        .filter(Member.team_id == team_id)
        .filter(extract("year", Shift.shift_date) == year, extract("month", Shift.shift_date) == month)
        .order_by(Shift.shift_date.desc())
        .all()
    )
    date_map = defaultdict(list)
    for s in shifts_query:
        entry = {
            "member_name": s.member.name if s.member else "Unknown",
            "member_id": s.member_id,
            "shift_id": s.id,
        }
        if s.swaps:
            entry["swap"] = s.swaps[0].to_dict()
        date_map[s.shift_date.isoformat()].append(entry)

    shotef_days = (
        ShotefDay.query
        .options(joinedload(ShotefDay.member))
        .filter_by(team_id=team_id, year=year, month=month)
        .order_by(ShotefDay.date).all()
    )

    result = {
        "team": team.to_dict(member_count=len(members)),
        "members": [m.to_dict() for m in members],
        "shifts": date_map,
        "shotef_days": [d.to_dict() for d in shotef_days],
    }
    _cache_set(cache_key, result)
    return jsonify(result)


# ══════════════════════════════════════
#  PAST SHIFTS
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/past-shifts", methods=["GET"])
def api_get_past_shifts(team_id):
    Team.query.get_or_404(team_id)
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)

    query = (
        Shift.query.join(Member)
        .options(
            joinedload(Shift.member),
            subqueryload(Shift.swaps).joinedload(ShiftSwap.original_member),
            subqueryload(Shift.swaps).joinedload(ShiftSwap.covering_member),
        )
        .filter(Member.team_id == team_id)
        .order_by(Shift.shift_date.desc())
    )
    if year and month:
        query = query.filter(
            extract("year", Shift.shift_date) == year,
            extract("month", Shift.shift_date) == month,
        )

    shifts = query.all()
    date_map = defaultdict(list)
    for s in shifts:
        entry = {
            "member_name": s.member.name if s.member else "Unknown",
            "member_id": s.member_id,
            "shift_id": s.id,
        }
        if s.swaps:
            entry["swap"] = s.swaps[0].to_dict()
        date_map[s.shift_date.isoformat()].append(entry)

    return jsonify({"shifts": date_map})


@app.route("/api/teams/<int:team_id>/past-shifts", methods=["POST"])
def api_bulk_add_past_shifts(team_id):
    Team.query.get_or_404(team_id)
    data = request.get_json() or {}
    member_id = data.get("member_id")
    shift_dates = data.get("shift_dates", [])

    member = Member.query.get_or_404(member_id)
    if member.team_id != team_id:
        return json_error("Member does not belong to this team")

    added = 0
    for d_str in shift_dates:
        try:
            d_obj = datetime.strptime(d_str, "%Y-%m-%d").date()
        except ValueError:
            continue
        existing = Shift.query.filter_by(member_id=member.id, shift_date=d_obj).first()
        if not existing:
            db.session.add(Shift(shift_date=d_obj, member_id=member.id))
            added += 1
    db.session.commit()

    msg = f"{added} shift{'s' if added != 1 else ''} added"
    return jsonify({"message": msg}), 201


@app.route("/api/shifts/<int:shift_id>", methods=["PUT"])
def api_reassign_shift(shift_id):
    """Directly reassign a shift to a different member (not a swap)."""
    shift = Shift.query.get_or_404(shift_id)
    data = request.get_json() or {}
    new_member_id = data.get("member_id")
    if not new_member_id:
        return json_error("member_id is required")
    member = Member.query.get_or_404(new_member_id)
    shift.member_id = member.id
    db.session.commit()
    return jsonify(shift.to_dict(member_name=member.name))


@app.route("/api/shifts/<int:shift_id>", methods=["DELETE"])
def api_delete_shift(shift_id):
    shift = Shift.query.get_or_404(shift_id)
    db.session.delete(shift)
    db.session.commit()
    return jsonify({"message": "Shift deleted"})


# ══════════════════════════════════════
#  SAVED SCHEDULES (grouped by month)
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/schedules", methods=["GET"])
def api_get_saved_schedules(team_id):
    Team.query.get_or_404(team_id)
    shifts = (
        Shift.query.join(Member)
        .options(
            joinedload(Shift.member),
            subqueryload(Shift.swaps).joinedload(ShiftSwap.original_member),
        )
        .filter(Member.team_id == team_id)
        .order_by(Shift.shift_date.desc())
        .all()
    )
    schedules = {}
    for s in shifts:
        key = f"{s.shift_date.year}-{s.shift_date.month:02d}"
        if key not in schedules:
            schedules[key] = {"year": s.shift_date.year, "month": s.shift_date.month, "shifts": []}
        schedules[key]["shifts"].append(s.to_dict())

    return jsonify({"schedules": list(schedules.values())})


# ══════════════════════════════════════
#  ADMIN SETTINGS
# ══════════════════════════════════════

@app.route("/api/settings", methods=["GET"])
def api_get_settings():
    team_id = request.args.get("team_id", type=int)
    result = {}
    for key, default in SETTINGS_DEFAULTS.items():
        result[key] = get_setting(key, team_id)
    return jsonify({"settings": result, "defaults": SETTINGS_DEFAULTS})


@app.route("/api/settings", methods=["PUT"])
def api_update_settings():
    data = request.get_json() or {}
    team_id = data.get("team_id")
    settings_data = data.get("settings", {})

    for key, value in settings_data.items():
        if key not in SETTINGS_DEFAULTS:
            continue
        existing = Settings.query.filter_by(team_id=team_id, key=key).first()
        if existing:
            existing.value = str(value)
        else:
            db.session.add(Settings(team_id=team_id, key=key, value=str(value)))
    db.session.commit()
    invalidate_settings_cache()

    result = {}
    for key in SETTINGS_DEFAULTS:
        result[key] = get_setting(key, team_id)
    return jsonify({"settings": result})


# ══════════════════════════════════════
#  SHOTEF ENDPOINTS (day-level)
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/shotef", methods=["GET"])
def api_get_shotef(team_id):
    Team.query.get_or_404(team_id)
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    if not year or not month:
        return json_error("Year and month are required")

    days = (
        ShotefDay.query
        .options(joinedload(ShotefDay.member))
        .filter_by(team_id=team_id, year=year, month=month)
        .order_by(ShotefDay.date).all()
    )

    return jsonify({"shotef_days": [d.to_dict() for d in days]})


@app.route("/api/teams/<int:team_id>/shotef/reassign", methods=["POST"])
def api_shotef_reassign(team_id):
    """Reassign a single shotef day to a different member."""
    Team.query.get_or_404(team_id)
    data = request.get_json() or {}
    shotef_day_id = data.get("shotef_day_id")
    new_member_id = data.get("member_id")

    if not shotef_day_id or not new_member_id:
        return json_error("shotef_day_id and member_id are required")

    sd = ShotefDay.query.get_or_404(shotef_day_id)
    if sd.team_id != team_id:
        return json_error("Shotef day does not belong to this team", 403)

    Member.query.get_or_404(new_member_id)
    sd.member_id = new_member_id
    db.session.commit()
    return jsonify(sd.to_dict())


@app.route("/api/shotef-days/<int:sd_id>", methods=["DELETE"])
def api_delete_shotef_day(sd_id):
    sd = ShotefDay.query.get_or_404(sd_id)
    db.session.delete(sd)
    db.session.commit()
    return jsonify({"message": "Shotef day deleted"})


@app.route("/api/teams/<int:team_id>/shotef-history", methods=["GET"])
def api_shotef_history(team_id):
    Team.query.get_or_404(team_id)
    members = Member.query.filter_by(team_id=team_id).all()
    member_ids = [m.id for m in members]

    settled_at_str = get_setting("shotef_settled_at", team_id)

    day_counts_q = db.session.query(ShotefDay.member_id, func.count(ShotefDay.id)).filter(
        ShotefDay.member_id.in_(member_ids)
    )
    if settled_at_str:
        try:
            settled_date = datetime.strptime(settled_at_str, "%Y-%m-%d").date()
            day_counts_q = day_counts_q.filter(ShotefDay.date >= settled_date)
        except ValueError:
            pass
    day_counts = dict(day_counts_q.group_by(ShotefDay.member_id).all()) if member_ids else {}

    result = []
    for m in members:
        effective = day_counts.get(m.id, 0) + m.shotef_credit
        result.append({
            "member_id": m.id,
            "name": m.name,
            "is_leader": m.is_leader,
            "total_shotef_days": day_counts.get(m.id, 0),
            "shotef_credit": m.shotef_credit,
            "effective_shotef_count": effective,
        })
    return jsonify({
        "history": result,
        "settled_at": settled_at_str or None,
    })


@app.route("/api/teams/<int:team_id>/shotef-settle", methods=["POST"])
def api_shotef_settle(team_id):
    """Settle shotef fairness: future calculations only consider data after today."""
    Team.query.get_or_404(team_id)
    today_str = date.today().isoformat()
    existing = Settings.query.filter_by(team_id=team_id, key="shotef_settled_at").first()
    if existing:
        existing.value = today_str
    else:
        db.session.add(Settings(team_id=team_id, key="shotef_settled_at", value=today_str))

    members = Member.query.filter_by(team_id=team_id).all()
    for m in members:
        m.shotef_credit = 0
    db.session.commit()
    invalidate_settings_cache()
    return jsonify({"message": "Shotef settled", "settled_at": today_str})


# ══════════════════════════════════════
#  ADD SHOTEF DAYS (manual entry)
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/shotef-days", methods=["POST"])
def api_add_shotef_days(team_id):
    """Add shotef day assignments for specific dates."""
    Team.query.get_or_404(team_id)
    data = request.get_json() or {}
    member_id = data.get("member_id")
    dates = data.get("dates", [])

    if not member_id or not dates:
        return json_error("member_id and dates are required")

    member = Member.query.get_or_404(member_id)
    if member.team_id != team_id:
        return json_error("Member does not belong to this team")

    added = 0
    for d_str in dates:
        try:
            d_obj = datetime.strptime(d_str, "%Y-%m-%d").date()
        except ValueError:
            continue
        existing = ShotefDay.query.filter_by(team_id=team_id, date=d_obj).first()
        if existing:
            continue
        db.session.add(ShotefDay(
            team_id=team_id, member_id=member.id, date=d_obj,
            year=d_obj.year, month=d_obj.month,
        ))
        added += 1
    db.session.commit()
    return jsonify({"message": f"{added} shotef day{'s' if added != 1 else ''} added", "count": added}), 201


# ══════════════════════════════════════
#  REPORTS
# ══════════════════════════════════════

@app.route("/api/reports", methods=["GET"])
def api_get_reports():
    cached = _cache_get("reports")
    if cached is not None:
        return jsonify(cached)
    teams = Team.query.all()
    all_members = Member.query.all()

    all_member_ids = [m.id for m in all_members]

    shift_counts = dict(
        db.session.query(Shift.member_id, func.count(Shift.id))
        .filter(Shift.member_id.in_(all_member_ids))
        .group_by(Shift.member_id).all()
    ) if all_member_ids else {}

    covers_done = dict(
        db.session.query(ShiftSwap.covering_member_id, func.count(ShiftSwap.id))
        .filter(ShiftSwap.covering_member_id.in_(all_member_ids))
        .group_by(ShiftSwap.covering_member_id).all()
    ) if all_member_ids else {}

    covers_received = dict(
        db.session.query(ShiftSwap.original_member_id, func.count(ShiftSwap.id))
        .filter(ShiftSwap.original_member_id.in_(all_member_ids))
        .group_by(ShiftSwap.original_member_id).all()
    ) if all_member_ids else {}

    shotef_counts = dict(
        db.session.query(ShotefDay.member_id, func.count(ShotefDay.id))
        .filter(ShotefDay.member_id.in_(all_member_ids))
        .group_by(ShotefDay.member_id).all()
    ) if all_member_ids else {}

    members_by_team = defaultdict(list)
    for m in all_members:
        members_by_team[m.team_id].append(m)

    total_shifts_count = sum(shift_counts.values()) if shift_counts else 0

    report = []
    for t in teams:
        team_members = members_by_team.get(t.id, [])
        member_data = []
        team_total = 0
        for m in team_members:
            sc = shift_counts.get(m.id, 0)
            cd = covers_done.get(m.id, 0)
            cr = covers_received.get(m.id, 0)
            sw = shotef_counts.get(m.id, 0)
            team_total += sc
            member_data.append({
                "id": m.id,
                "name": m.name,
                "shift_count": sc,
                "shift_credit": m.shift_credit,
                "covers_done": cd,
                "covers_received": cr,
                "swap_balance": cr - cd,
                "shotef_days": sw,
            })
        report.append({
            "team_id": t.id,
            "team_name": t.name,
            "member_count": len(team_members),
            "total_shifts": team_total,
            "members": member_data,
        })

    result = {
        "teams": report,
        "stats": {
            "total_teams": len(teams),
            "total_members": len(all_members),
            "total_shifts": total_shifts_count,
        },
    }
    _cache_set("reports", result)
    return jsonify(result)


if __name__ == "__main__":
    logger.info("Shifter API running")
    app.run(debug=True, port=5001)
