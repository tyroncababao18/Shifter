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
    db, User, Organization, OrganizationMembership, TeamMembership,
    Team, Member, Unavailability, Shift, ShiftSwap, Settings,
    ShotefDay, SETTINGS_DEFAULTS,
    LeaveRequest, RecurringUnavailability, LEAVE_TYPES, LEAVE_STATUSES,
)
from auth import login_required, is_shifter_admin, is_team_admin, is_team_member, get_accessible_team_ids

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

# Register blueprints
from routes_auth import auth_bp
from routes_admin import admin_bp
app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp)

@app.before_request
def _clear_per_request_caches():
    _settings_cache.clear()
    if request.method in ("POST", "PUT", "DELETE"):
        _cache_clear_all()

db.init_app(app)
with app.app_context():
    db.create_all()

    # Auto-migrate: add columns if missing
    from sqlalchemy import inspect as sa_inspect
    _inspector = sa_inspect(db.engine)

    _member_cols = [c["name"] for c in _inspector.get_columns("members")]
    if "shift_weight" not in _member_cols:
        db.session.execute(db.text(
            "ALTER TABLE members ADD COLUMN shift_weight REAL DEFAULT 1.0 NOT NULL"
        ))
        db.session.commit()

    # Add organization_id to teams if missing
    _team_cols = [c["name"] for c in _inspector.get_columns("teams")]
    if "organization_id" not in _team_cols:
        db.session.execute(db.text(
            "ALTER TABLE teams ADD COLUMN organization_id INTEGER REFERENCES organizations(id)"
        ))
        db.session.commit()

    # Remove unique constraint on team name if it exists (now unique per org, not global)
    # SQLite doesn't support DROP CONSTRAINT, so we skip this for SQLite
    if not db_url.startswith("sqlite"):
        try:
            db.session.execute(db.text("ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_name_key"))
            db.session.commit()
        except Exception:
            db.session.rollback()

    # Add leave_type and leave_request_id to unavailability if missing
    _unav_cols = [c["name"] for c in _inspector.get_columns("unavailability")]
    if "leave_type" not in _unav_cols:
        db.session.execute(db.text(
            "ALTER TABLE unavailability ADD COLUMN leave_type VARCHAR(30)"
        ))
        db.session.commit()
    if "leave_request_id" not in _unav_cols:
        db.session.execute(db.text(
            "ALTER TABLE unavailability ADD COLUMN leave_request_id INTEGER REFERENCES leave_requests(id)"
        ))
        db.session.commit()

    # Auto-seed: create default admin if no users exist
    if User.query.count() == 0:
        from seed_auth import seed_auth_data
        seed_auth_data()

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
@login_required
def api_get_teams():
    from flask import g
    user = g.current_user
    accessible = get_accessible_team_ids(user)
    org_filter = request.args.get("organization_id", type=int)

    cache_key = f"teams-list-{user.id}-org{org_filter or 'all'}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)

    query = Team.query.order_by(Team.name)
    if accessible is not None:
        query = query.filter(Team.id.in_(accessible))
    if org_filter is not None:
        query = query.filter(Team.organization_id == org_filter)
    teams = query.all()

    team_ids = [t.id for t in teams]
    member_counts = dict(
        db.session.query(Member.team_id, func.count(Member.id))
        .filter(Member.team_id.in_(team_ids))
        .group_by(Member.team_id).all()
    ) if team_ids else {}
    total_members = sum(member_counts.values()) if member_counts else 0
    total_shifts = db.session.query(func.count(Shift.id)).filter(
        Shift.member_id.in_(
            db.session.query(Member.id).filter(Member.team_id.in_(team_ids))
        )
    ).scalar() or 0 if team_ids else 0
    result = {
        "teams": [t.to_dict(member_count=member_counts.get(t.id, 0)) for t in teams],
        "stats": {
            "total_teams": len(teams),
            "total_members": total_members,
            "total_shifts": total_shifts,
        },
    }
    _cache_set(cache_key, result)
    return jsonify(result)


@app.route("/api/teams", methods=["POST"])
@login_required
def api_create_team():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return json_error("Team name is required")
    if Team.query.filter_by(name=name).first():
        return json_error("Team name already exists")

    org_id = data.get("organization_id")
    team = Team(name=name, description=data.get("description", ""), organization_id=org_id)
    db.session.add(team)
    db.session.commit()
    return jsonify(team.to_dict()), 201


@app.route("/api/teams/<int:team_id>", methods=["GET"])
@login_required
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
@login_required
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
@login_required
def api_delete_team(team_id):
    team = Team.query.get_or_404(team_id)
    db.session.delete(team)
    db.session.commit()
    return jsonify({"message": "Team deleted"})


@app.route("/api/teams/<int:team_id>/upload-picture", methods=["POST"])
@login_required
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
@login_required
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
@login_required
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
@login_required
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
    if "day_shift_credit" in data:
        member.shotef_credit = int(data["day_shift_credit"])
    if "shift_weight" in data:
        member.shift_weight = max(0.1, min(2.0, float(data["shift_weight"])))
    db.session.commit()
    return jsonify(member.to_dict())


@app.route("/api/members/<int:member_id>", methods=["DELETE"])
@login_required
def api_delete_member(member_id):
    member = Member.query.get_or_404(member_id)
    db.session.delete(member)
    db.session.commit()
    return jsonify({"message": "Member deleted"})


@app.route("/api/members/<int:member_id>/upload-photo", methods=["POST"])
@login_required
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
@login_required
def api_get_unavailabilities(member_id):
    Member.query.get_or_404(member_id)
    unavs = Unavailability.query.filter_by(member_id=member_id).order_by(Unavailability.date).all()
    return jsonify({"unavailabilities": [u.to_dict() for u in unavs]})


@app.route("/api/members/<int:member_id>/unavailabilities", methods=["POST"])
@login_required
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
@login_required
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
@login_required
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
@login_required
def api_delete_unavailability(unav_id):
    unav = Unavailability.query.get_or_404(unav_id)
    db.session.delete(unav)
    db.session.commit()
    return jsonify({"message": "Unavailability deleted"})


# ══════════════════════════════════════
#  SHIFT SWAPS
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/schedule/swap", methods=["POST"])
@login_required
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
@login_required
def api_revert_swap(swap_id):
    swap = ShiftSwap.query.get_or_404(swap_id)
    shift = Shift.query.get(swap.shift_id)
    if shift:
        shift.member_id = swap.original_member_id
    db.session.delete(swap)
    db.session.commit()
    return jsonify({"message": "Swap reverted", "shift": shift.to_dict() if shift else None})


@app.route("/api/teams/<int:team_id>/swap-balance", methods=["GET"])
@login_required
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
@login_required
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
@login_required
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
        day_shift_assignments, day_shift_needs_substitute = generate_day_shifts(team_id, year, month)

        return jsonify({
            "assignments": assignments,
            "suggestions": suggestions,
            "day_shift_assignments": day_shift_assignments,
            "day_shift_needs_substitute": day_shift_needs_substitute,
        })
    except Exception as e:
        db.session.rollback()
        logger.exception("Schedule generation failed")
        return json_error(str(e), 500)


from scheduling import create_schedule  # noqa: E402 — extracted to scheduling package


# ══════════════════════════════════════
#  DAY SHIFT GENERATION
# ══════════════════════════════════════

def _get_day_shift_week_blocks(year, month):
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


def generate_day_shifts(team_id, year, month):
    """Generate day shift weekly rotation for a month using day-level assignments."""
    day_shift_enabled = get_setting("shotef_enabled", team_id)  # settings key unchanged for DB compat
    if day_shift_enabled.lower() != "true":
        return [], []

    all_members = Member.query.filter_by(team_id=team_id).all()
    members = [m for m in all_members if not m.is_leader]
    if not members:
        return [], []

    ShotefDay.query.filter_by(team_id=team_id, year=year, month=month).delete(synchronize_session="fetch")
    db.session.flush()

    lookback_months = int(get_setting("justice_lookback_months", team_id))
    settled_at_str = get_setting("shotef_settled_at", team_id)  # settings key unchanged for DB compat

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
    day_shift_counts = dict(count_q.group_by(ShotefDay.member_id).all())
    for m in members:
        day_shift_counts.setdefault(m.id, 0)
        day_shift_counts[m.id] += m.shotef_credit  # DB column unchanged

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

    week_blocks = _get_day_shift_week_blocks(year, month)

    day_shift_assignments = []
    day_shift_needs_substitute = []
    assigned_this_month = set()

    for week_start, days in week_blocks:
        eligible = [m for m in members if m.id not in assigned_this_month]
        if not eligible:
            eligible = list(members)

        eligible.sort(key=lambda m: (day_shift_counts.get(m.id, 0), random.random()))
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

        day_shift_counts[chosen.id] = day_shift_counts.get(chosen.id, 0) + len(days)

        day_shift_assignments.append({
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
                    "day_shift_count": day_shift_counts.get(m.id, 0),
                    "is_unavailable": ud in unav_dict[m.id],
                })
            optional.sort(key=lambda x: (x["is_unavailable"], x["day_shift_count"], random.random()))
            day_shift_needs_substitute.append({
                "member_name": chosen.name,
                "date": ud.isoformat(),
                "day_of_week": ud.strftime("%A"),
                "reason": reason_dict.get((chosen.id, ud), "Marked unavailable"),
                "optional_members": optional,
            })

    db.session.commit()
    return day_shift_assignments, day_shift_needs_substitute


# ══════════════════════════════════════
#  SCHEDULE VIEWING / DELETING / EXPORT
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/schedule", methods=["GET"])
@login_required
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
@login_required
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
@login_required
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
@login_required
def api_schedule_view(team_id):
    """Combined endpoint: team + members + shifts + day shifts for one month."""
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

    day_shift_days = (
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

    all_settings = get_all_settings(team_id)
    active_days_str = all_settings.get("active_days", "0,1,2,3,4,5,6")

    result = {
        "team": team.to_dict(member_count=len(members)),
        "members": members_data,
        "shifts": [s.to_dict() for s in shifts],
        "day_shift_days": [d.to_dict() for d in day_shift_days],
        "active_days": active_days_str,
    }
    _cache_set(cache_key, result)
    return jsonify(result)


@app.route("/api/teams/<int:team_id>/past-shifts-view", methods=["GET"])
@login_required
def api_past_shifts_view(team_id):
    """Combined endpoint: team + members + past shifts + day shifts for one month."""
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

    day_shift_days = (
        ShotefDay.query
        .options(joinedload(ShotefDay.member))
        .filter_by(team_id=team_id, year=year, month=month)
        .order_by(ShotefDay.date).all()
    )

    result = {
        "team": team.to_dict(member_count=len(members)),
        "members": [m.to_dict() for m in members],
        "shifts": date_map,
        "day_shift_days": [d.to_dict() for d in day_shift_days],
    }
    _cache_set(cache_key, result)
    return jsonify(result)


# ══════════════════════════════════════
#  PAST SHIFTS
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/past-shifts", methods=["GET"])
@login_required
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
@login_required
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
@login_required
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
@login_required
def api_delete_shift(shift_id):
    shift = Shift.query.get_or_404(shift_id)
    db.session.delete(shift)
    db.session.commit()
    return jsonify({"message": "Shift deleted"})


# ══════════════════════════════════════
#  SAVED SCHEDULES (grouped by month)
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/schedules", methods=["GET"])
@login_required
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
@login_required
def api_get_settings():
    team_id = request.args.get("team_id", type=int)
    result = {}
    for key, default in SETTINGS_DEFAULTS.items():
        result[key] = get_setting(key, team_id)
    return jsonify({"settings": result, "defaults": SETTINGS_DEFAULTS})


@app.route("/api/settings", methods=["PUT"])
@login_required
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
#  DAY SHIFT ENDPOINTS
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/day-shifts", methods=["GET"])
@login_required
def api_get_day_shifts(team_id):
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

    return jsonify({"day_shift_days": [d.to_dict() for d in days]})


@app.route("/api/teams/<int:team_id>/day-shifts/reassign", methods=["POST"])
@login_required
def api_day_shift_reassign(team_id):
    """Reassign a single day shift to a different member."""
    Team.query.get_or_404(team_id)
    data = request.get_json() or {}
    day_shift_id = data.get("day_shift_id") or data.get("shotef_day_id")  # accept both for compat
    new_member_id = data.get("member_id")

    if not day_shift_id or not new_member_id:
        return json_error("day_shift_id and member_id are required")

    sd = ShotefDay.query.get_or_404(day_shift_id)
    if sd.team_id != team_id:
        return json_error("Day shift does not belong to this team", 403)

    Member.query.get_or_404(new_member_id)
    sd.member_id = new_member_id
    db.session.commit()
    return jsonify(sd.to_dict())


@app.route("/api/day-shift-days/<int:sd_id>", methods=["DELETE"])
@login_required
def api_delete_day_shift(sd_id):
    sd = ShotefDay.query.get_or_404(sd_id)
    db.session.delete(sd)
    db.session.commit()
    return jsonify({"message": "Day shift deleted"})


@app.route("/api/teams/<int:team_id>/day-shift-history", methods=["GET"])
@login_required
def api_day_shift_history(team_id):
    Team.query.get_or_404(team_id)
    members = Member.query.filter_by(team_id=team_id).all()
    member_ids = [m.id for m in members]

    settled_at_str = get_setting("shotef_settled_at", team_id)  # settings key unchanged for DB compat

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
        effective = day_counts.get(m.id, 0) + m.shotef_credit  # DB column unchanged
        result.append({
            "member_id": m.id,
            "name": m.name,
            "is_leader": m.is_leader,
            "total_day_shift_days": day_counts.get(m.id, 0),
            "day_shift_credit": m.shotef_credit,
            "effective_day_shift_count": effective,
        })
    return jsonify({
        "history": result,
        "settled_at": settled_at_str or None,
    })


@app.route("/api/teams/<int:team_id>/day-shift-settle", methods=["POST"])
@login_required
def api_day_shift_settle(team_id):
    """Settle day shift fairness: future calculations only consider data after today."""
    Team.query.get_or_404(team_id)
    today_str = date.today().isoformat()
    existing = Settings.query.filter_by(team_id=team_id, key="shotef_settled_at").first()  # settings key unchanged for DB compat
    if existing:
        existing.value = today_str
    else:
        db.session.add(Settings(team_id=team_id, key="shotef_settled_at", value=today_str))

    members = Member.query.filter_by(team_id=team_id).all()
    for m in members:
        m.shotef_credit = 0  # DB column unchanged
    db.session.commit()
    invalidate_settings_cache()
    return jsonify({"message": "Day shifts settled", "settled_at": today_str})


# ══════════════════════════════════════
#  ADD DAY SHIFT DAYS (manual entry)
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/day-shift-days", methods=["POST"])
@login_required
def api_add_day_shift_days(team_id):
    """Add day shift assignments for specific dates."""
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
    return jsonify({"message": f"{added} day shift{'s' if added != 1 else ''} added", "count": added}), 201


# ══════════════════════════════════════
#  REPORTS
# ══════════════════════════════════════

@app.route("/api/reports", methods=["GET"])
@login_required
def api_get_reports():
    from flask import g
    org_filter = request.args.get("organization_id", type=int)
    user = g.current_user
    accessible = get_accessible_team_ids(user)

    cache_key = f"reports-{user.id}-org{org_filter or 'all'}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)

    query = Team.query
    if accessible is not None:
        query = query.filter(Team.id.in_(accessible))
    if org_filter is not None:
        query = query.filter(Team.organization_id == org_filter)
    teams = query.all()
    team_ids = [t.id for t in teams]
    all_members = Member.query.filter(Member.team_id.in_(team_ids)).all() if team_ids else []

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

    day_shift_counts = dict(
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
            sw = day_shift_counts.get(m.id, 0)
            team_total += sc
            member_data.append({
                "id": m.id,
                "name": m.name,
                "shift_count": sc,
                "shift_credit": m.shift_credit,
                "covers_done": cd,
                "covers_received": cr,
                "swap_balance": cr - cd,
                "day_shift_days": sw,
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
    _cache_set(cache_key, result)
    return jsonify(result)


# ══════════════════════════════════════
#  LEAVE REQUESTS API
# ══════════════════════════════════════

@app.route("/api/teams/<int:team_id>/leave-requests", methods=["GET"])
@login_required
def api_get_leave_requests(team_id):
    """Get leave requests for a team. Admins see all, employees see own."""
    from flask import g
    team = Team.query.get_or_404(team_id)
    if not is_team_member(g.current_user, team_id):
        return jsonify({"error": "Access denied"}), 403

    query = LeaveRequest.query.filter_by(team_id=team_id)

    status_filter = request.args.get("status")
    if status_filter and status_filter in LEAVE_STATUSES:
        query = query.filter_by(status=status_filter)

    member_id_filter = request.args.get("member_id")
    if member_id_filter:
        query = query.filter_by(member_id=int(member_id_filter))

    requests_list = query.order_by(LeaveRequest.created_at.desc()).all()
    return jsonify({"leave_requests": [r.to_dict() for r in requests_list]})


@app.route("/api/teams/<int:team_id>/leave-requests", methods=["POST"])
@login_required
def api_create_leave_request(team_id):
    """Submit a new leave request."""
    from flask import g
    team = Team.query.get_or_404(team_id)
    if not is_team_member(g.current_user, team_id):
        return jsonify({"error": "Access denied"}), 403

    data = request.get_json() or {}
    member_id = data.get("member_id")
    leave_type = data.get("leave_type", "")
    start_date_str = data.get("start_date", "")
    end_date_str = data.get("end_date", "")
    partial_day = data.get("partial_day")
    notes = data.get("notes", "")

    if not member_id:
        return json_error("member_id is required")
    member = Member.query.get_or_404(member_id)
    if member.team_id != team_id:
        return json_error("Member does not belong to this team")
    if leave_type not in LEAVE_TYPES:
        return json_error(f"leave_type must be one of: {', '.join(LEAVE_TYPES)}")
    if not start_date_str or not end_date_str:
        return json_error("start_date and end_date are required")

    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
    except ValueError:
        return json_error("Invalid date format, use YYYY-MM-DD")

    if end_date < start_date:
        return json_error("end_date must be >= start_date")
    if partial_day and partial_day not in ("morning", "afternoon"):
        return json_error("partial_day must be 'morning' or 'afternoon'")
    if partial_day and start_date != end_date:
        return json_error("partial_day is only allowed for single-day requests")

    lr = LeaveRequest(
        member_id=member_id,
        team_id=team_id,
        leave_type=leave_type,
        start_date=start_date,
        end_date=end_date,
        partial_day=partial_day,
        notes=notes,
        requested_by_user_id=g.current_user.id,
    )
    db.session.add(lr)
    db.session.commit()
    _cache_clear_team(team_id)
    return jsonify(lr.to_dict()), 201


@app.route("/api/leave-requests/<int:lr_id>", methods=["GET"])
@login_required
def api_get_leave_request(lr_id):
    lr = LeaveRequest.query.get_or_404(lr_id)
    return jsonify(lr.to_dict())


@app.route("/api/leave-requests/<int:lr_id>", methods=["DELETE"])
@login_required
def api_cancel_leave_request(lr_id):
    """Cancel a pending leave request."""
    from flask import g
    lr = LeaveRequest.query.get_or_404(lr_id)
    if lr.status != "pending":
        # Admins can revoke approved requests
        if lr.status == "approved" and is_team_admin(g.current_user, lr.team_id):
            # Remove associated unavailabilities
            Unavailability.query.filter_by(leave_request_id=lr.id).delete()
            db.session.delete(lr)
            db.session.commit()
            _cache_clear_team(lr.team_id)
            return jsonify({"message": "Approved leave revoked and unavailabilities removed"})
        return json_error("Only pending requests can be cancelled")

    if not is_team_member(g.current_user, lr.team_id):
        return jsonify({"error": "Access denied"}), 403

    db.session.delete(lr)
    db.session.commit()
    _cache_clear_team(lr.team_id)
    return jsonify({"message": "Leave request cancelled"})


@app.route("/api/leave-requests/<int:lr_id>/approve", methods=["POST"])
@login_required
def api_approve_leave_request(lr_id):
    """Approve a leave request and create unavailability records."""
    from flask import g
    lr = LeaveRequest.query.get_or_404(lr_id)
    if not is_team_admin(g.current_user, lr.team_id):
        return jsonify({"error": "Team admin access required"}), 403
    if lr.status != "pending":
        return json_error(f"Request is already {lr.status}")

    data = request.get_json() or {}
    lr.status = "approved"
    lr.reviewed_by_user_id = g.current_user.id
    lr.reviewed_at = datetime.utcnow()
    lr.review_notes = data.get("review_notes", "")

    # Create unavailability records for each date in range
    current = lr.start_date
    reason_label = lr.leave_type.capitalize()
    if lr.partial_day:
        reason_label += f" ({lr.partial_day})"
    while current <= lr.end_date:
        existing = Unavailability.query.filter_by(member_id=lr.member_id, date=current).first()
        if existing:
            existing.reason = reason_label
            existing.leave_type = lr.leave_type
            existing.leave_request_id = lr.id
        else:
            db.session.add(Unavailability(
                member_id=lr.member_id,
                date=current,
                reason=reason_label,
                leave_type=lr.leave_type,
                leave_request_id=lr.id,
            ))
        current += timedelta(days=1)

    db.session.commit()
    _cache_clear_team(lr.team_id)
    return jsonify(lr.to_dict())


@app.route("/api/leave-requests/<int:lr_id>/reject", methods=["POST"])
@login_required
def api_reject_leave_request(lr_id):
    """Reject a leave request."""
    from flask import g
    lr = LeaveRequest.query.get_or_404(lr_id)
    if not is_team_admin(g.current_user, lr.team_id):
        return jsonify({"error": "Team admin access required"}), 403
    if lr.status != "pending":
        return json_error(f"Request is already {lr.status}")

    data = request.get_json() or {}
    lr.status = "rejected"
    lr.reviewed_by_user_id = g.current_user.id
    lr.reviewed_at = datetime.utcnow()
    lr.review_notes = data.get("review_notes", "")

    db.session.commit()
    _cache_clear_team(lr.team_id)
    return jsonify(lr.to_dict())


# ══════════════════════════════════════
#  RECURRING UNAVAILABILITIES API
# ══════════════════════════════════════

@app.route("/api/members/<int:member_id>/recurring-unavailabilities", methods=["GET"])
@login_required
def api_get_recurring_unavailabilities(member_id):
    Member.query.get_or_404(member_id)
    items = RecurringUnavailability.query.filter_by(member_id=member_id).all()
    return jsonify({"recurring_unavailabilities": [r.to_dict() for r in items]})


@app.route("/api/members/<int:member_id>/recurring-unavailabilities", methods=["POST"])
@login_required
def api_create_recurring_unavailability(member_id):
    member = Member.query.get_or_404(member_id)
    data = request.get_json() or {}

    day_of_week = data.get("day_of_week")
    if day_of_week is None or not (0 <= int(day_of_week) <= 6):
        return json_error("day_of_week must be 0-6 (Sunday=0)")
    frequency = data.get("frequency", "weekly")
    if frequency not in ("weekly", "biweekly"):
        return json_error("frequency must be 'weekly' or 'biweekly'")

    start_date = None
    end_date = None
    if data.get("start_date"):
        try:
            start_date = datetime.strptime(data["start_date"], "%Y-%m-%d").date()
        except ValueError:
            return json_error("Invalid start_date format")
    if data.get("end_date"):
        try:
            end_date = datetime.strptime(data["end_date"], "%Y-%m-%d").date()
        except ValueError:
            return json_error("Invalid end_date format")

    rec = RecurringUnavailability(
        member_id=member_id,
        day_of_week=int(day_of_week),
        frequency=frequency,
        start_date=start_date,
        end_date=end_date,
        reason=data.get("reason", ""),
    )
    db.session.add(rec)
    db.session.commit()
    _cache_clear_team(member.team_id)
    return jsonify(rec.to_dict()), 201


@app.route("/api/recurring-unavailabilities/<int:rec_id>", methods=["DELETE"])
@login_required
def api_delete_recurring_unavailability(rec_id):
    rec = RecurringUnavailability.query.get_or_404(rec_id)
    team_id = rec.member.team_id
    db.session.delete(rec)
    db.session.commit()
    _cache_clear_team(team_id)
    return jsonify({"message": "Recurring unavailability deleted"})


@app.route("/api/members/<int:member_id>/recurring-unavailabilities/apply", methods=["POST"])
@login_required
def api_apply_recurring_unavailabilities(member_id):
    """Generate unavailability records from recurring patterns for a given month."""
    member = Member.query.get_or_404(member_id)
    data = request.get_json() or {}
    year = data.get("year", datetime.now().year)
    month = data.get("month", datetime.now().month)

    patterns = RecurringUnavailability.query.filter_by(member_id=member_id).all()
    if not patterns:
        return jsonify({"message": "No recurring patterns", "count": 0})

    _, days_in_month = monthrange(year, month)
    added = 0
    for day_num in range(1, days_in_month + 1):
        d = date(year, month, day_num)
        # Python weekday: Monday=0, Sunday=6. Convert to our format: Sunday=0
        py_dow = d.weekday()
        our_dow = (py_dow + 1) % 7  # Mon=1,Tue=2,...,Sat=6,Sun=0

        for p in patterns:
            if p.day_of_week != our_dow:
                continue
            if p.start_date and d < p.start_date:
                continue
            if p.end_date and d > p.end_date:
                continue
            # For biweekly, check week parity relative to start_date
            if p.frequency == "biweekly" and p.start_date:
                weeks_diff = (d - p.start_date).days // 7
                if weeks_diff % 2 != 0:
                    continue

            existing = Unavailability.query.filter_by(member_id=member_id, date=d).first()
            if not existing:
                db.session.add(Unavailability(
                    member_id=member_id, date=d, reason=p.reason or "Recurring"
                ))
                added += 1

    db.session.commit()
    _cache_clear_team(member.team_id)
    return jsonify({"message": f"{added} unavailabilities created from patterns", "count": added})


if __name__ == "__main__":
    logger.info("Shifter API running")
    app.run(debug=True, port=5001)
