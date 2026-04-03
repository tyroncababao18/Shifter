from datetime import datetime
import bcrypt
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


# ══════════════════════════════════════
#  AUTH & MULTI-TENANT MODELS
# ══════════════════════════════════════

class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    first_name = db.Column(db.String(100), nullable=True)
    last_name = db.Column(db.String(100), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    must_change_password = db.Column(db.Boolean, default=True, nullable=False)
    platform_role = db.Column(db.String(20), default="none", nullable=False)  # "shifter_admin" or "none"
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    org_memberships = db.relationship("OrganizationMembership", backref="user", cascade="all, delete-orphan", lazy="select")
    team_memberships = db.relationship("TeamMembership", backref="user", cascade="all, delete-orphan", lazy="select")

    def set_password(self, password: str):
        self.password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    def check_password(self, password: str) -> bool:
        return bcrypt.checkpw(password.encode("utf-8"), self.password_hash.encode("utf-8"))

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "is_active": self.is_active,
            "must_change_password": self.must_change_password,
            "platform_role": self.platform_role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Organization(db.Model):
    __tablename__ = "organizations"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    memberships = db.relationship("OrganizationMembership", backref="organization", cascade="all, delete-orphan", lazy="select")
    teams = db.relationship("Team", backref="organization", cascade="all, delete-orphan", lazy="select")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class OrganizationMembership(db.Model):
    __tablename__ = "organization_memberships"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    organization_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=False, index=True)
    org_role = db.Column(db.String(30), nullable=False, default="member")  # "organization_admin" or "member"
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("user_id", "organization_id", name="uq_org_membership"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "organization_id": self.organization_id,
            "org_role": self.org_role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TeamMembership(db.Model):
    __tablename__ = "team_memberships"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False, index=True)
    team_role = db.Column(db.String(20), nullable=False, default="employee")  # "team_admin" or "employee"
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("user_id", "team_id", name="uq_team_membership"),
    )

    team = db.relationship("Team", backref="team_memberships")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "team_id": self.team_id,
            "team_role": self.team_role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ══════════════════════════════════════
#  EXISTING MODELS
# ══════════════════════════════════════

class Team(db.Model):
    __tablename__ = "teams"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    organization_id = db.Column(db.Integer, db.ForeignKey("organizations.id"), nullable=True, index=True)
    picture_url = db.Column(db.String(255), nullable=True)
    description = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    members = db.relationship("Member", backref="team", cascade="all, delete-orphan", lazy=True)
    shotef_days = db.relationship("ShotefDay", backref="team", cascade="all, delete-orphan", lazy=True)

    def to_dict(self, member_count=None):
        return {
            "id": self.id,
            "name": self.name,
            "organization_id": self.organization_id,
            "picture_url": self.picture_url,
            "description": self.description,
            "member_count": member_count if member_count is not None else len(self.members),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Member(db.Model):
    __tablename__ = "members"
    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    sleeps_in_building = db.Column(db.Boolean, default=False)
    is_leader = db.Column(db.Boolean, default=False)
    photo_url = db.Column(db.String(255), nullable=True)
    shift_credit = db.Column(db.Integer, default=0)
    shotef_credit = db.Column(db.Integer, default=0)
    shift_weight = db.Column(db.Float, default=1.0, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    unavailabilities = db.relationship(
        "Unavailability", backref="member", cascade="all, delete-orphan", lazy="select"
    )
    shifts = db.relationship(
        "Shift", backref="member", cascade="all, delete-orphan", lazy="select"
    )

    __table_args__ = (
        db.UniqueConstraint("team_id", "name", name="uq_member_team_name"),
    )

    def to_dict(self, shift_count=None):
        return {
            "id": self.id,
            "team_id": self.team_id,
            "name": self.name,
            "sleeps_in_building": self.sleeps_in_building,
            "is_leader": self.is_leader,
            "photo_url": self.photo_url,
            "shift_credit": self.shift_credit,
            "day_shift_credit": self.shotef_credit,  # DB column: shotef_credit
            "shift_weight": self.shift_weight,
            "shift_count": shift_count if shift_count is not None else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Unavailability(db.Model):
    __tablename__ = "unavailability"
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey("members.id"), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, index=True)
    reason = db.Column(db.String(255), nullable=True)
    leave_type = db.Column(db.String(30), nullable=True)  # "vacation", "sick", "personal", or NULL for generic
    leave_request_id = db.Column(db.Integer, db.ForeignKey("leave_requests.id"), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("member_id", "date", name="uq_member_date"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "member_id": self.member_id,
            "date": self.date.isoformat(),
            "reason": self.reason or "",
            "leave_type": self.leave_type,
            "leave_request_id": self.leave_request_id,
        }


LEAVE_TYPES = ("vacation", "sick", "personal")
LEAVE_STATUSES = ("pending", "approved", "rejected")


class LeaveRequest(db.Model):
    __tablename__ = "leave_requests"
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey("members.id"), nullable=False, index=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False, index=True)
    leave_type = db.Column(db.String(30), nullable=False)  # "vacation", "sick", "personal"
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    partial_day = db.Column(db.String(20), nullable=True)  # NULL=full day, "morning", "afternoon"
    status = db.Column(db.String(20), nullable=False, default="pending")  # "pending", "approved", "rejected"
    notes = db.Column(db.Text, nullable=True)
    requested_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    reviewed_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    review_notes = db.Column(db.Text, nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    member = db.relationship("Member", backref="leave_requests")
    team = db.relationship("Team", backref="leave_requests")
    requested_by = db.relationship("User", foreign_keys=[requested_by_user_id])
    reviewed_by = db.relationship("User", foreign_keys=[reviewed_by_user_id])
    unavailabilities = db.relationship("Unavailability", backref="leave_request", lazy="select")

    def to_dict(self):
        return {
            "id": self.id,
            "member_id": self.member_id,
            "team_id": self.team_id,
            "leave_type": self.leave_type,
            "start_date": self.start_date.isoformat(),
            "end_date": self.end_date.isoformat(),
            "partial_day": self.partial_day,
            "status": self.status,
            "notes": self.notes or "",
            "requested_by_user_id": self.requested_by_user_id,
            "requested_by_name": (
                f"{self.requested_by.first_name or ''} {self.requested_by.last_name or ''}".strip()
                if self.requested_by else None
            ),
            "reviewed_by_user_id": self.reviewed_by_user_id,
            "reviewed_by_name": (
                f"{self.reviewed_by.first_name or ''} {self.reviewed_by.last_name or ''}".strip()
                if self.reviewed_by else None
            ),
            "review_notes": self.review_notes or "",
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "member_name": self.member.name if self.member else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class RecurringUnavailability(db.Model):
    __tablename__ = "recurring_unavailabilities"
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey("members.id"), nullable=False, index=True)
    day_of_week = db.Column(db.Integer, nullable=False)  # 0=Sunday ... 6=Saturday
    frequency = db.Column(db.String(20), nullable=False, default="weekly")  # "weekly" or "biweekly"
    start_date = db.Column(db.Date, nullable=True)  # NULL = no start bound
    end_date = db.Column(db.Date, nullable=True)  # NULL = no end bound
    reason = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    member = db.relationship("Member", backref="recurring_unavailabilities")

    def to_dict(self):
        return {
            "id": self.id,
            "member_id": self.member_id,
            "day_of_week": self.day_of_week,
            "frequency": self.frequency,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "reason": self.reason or "",
        }


class Shift(db.Model):
    __tablename__ = "shifts"
    id = db.Column(db.Integer, primary_key=True)
    shift_date = db.Column(db.Date, nullable=False, index=True)
    member_id = db.Column(db.Integer, db.ForeignKey("members.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    swaps = db.relationship("ShiftSwap", backref="shift", cascade="all, delete-orphan", lazy="select")

    __table_args__ = (
        db.UniqueConstraint("member_id", "shift_date", name="uq_member_shift_date"),
    )

    def to_dict(self, member_name=None, swap_info=None):
        result = {
            "id": self.id,
            "shift_date": self.shift_date.isoformat(),
            "day_of_week": self.shift_date.strftime("%A"),
            "member_id": self.member_id,
            "member_name": member_name or (self.member.name if self.member else "Unknown"),
        }
        if swap_info is not None:
            result["swap"] = swap_info
        elif self.swaps:
            swap = self.swaps[0]
            result["swap"] = {
                "id": swap.id,
                "original_member_id": swap.original_member_id,
                "original_member_name": swap.original_member.name if swap.original_member else "Unknown",
                "covering_member_id": swap.covering_member_id,
            }
        return result


class ShiftSwap(db.Model):
    __tablename__ = "shift_swaps"
    id = db.Column(db.Integer, primary_key=True)
    shift_id = db.Column(db.Integer, db.ForeignKey("shifts.id"), nullable=False, index=True)
    original_member_id = db.Column(db.Integer, db.ForeignKey("members.id"), nullable=False, index=True)
    covering_member_id = db.Column(db.Integer, db.ForeignKey("members.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    original_member = db.relationship("Member", foreign_keys=[original_member_id])
    covering_member = db.relationship("Member", foreign_keys=[covering_member_id])

    def to_dict(self):
        return {
            "id": self.id,
            "shift_id": self.shift_id,
            "original_member_id": self.original_member_id,
            "original_member_name": self.original_member.name if self.original_member else "Unknown",
            "covering_member_id": self.covering_member_id,
            "covering_member_name": self.covering_member.name if self.covering_member else "Unknown",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ShotefDay(db.Model):
    __tablename__ = "shotef_days"
    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False, index=True)
    member_id = db.Column(db.Integer, db.ForeignKey("members.id"), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, index=True)
    year = db.Column(db.Integer, nullable=False)
    month = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    member = db.relationship("Member", backref="shotef_days")

    __table_args__ = (
        db.UniqueConstraint("team_id", "date", name="uq_shotef_day"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "team_id": self.team_id,
            "member_id": self.member_id,
            "member_name": self.member.name if self.member else "Unknown",
            "date": self.date.isoformat(),
            "year": self.year,
            "month": self.month,
        }


class Settings(db.Model):
    __tablename__ = "settings"
    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=True, index=True)
    key = db.Column(db.String(100), nullable=False)
    value = db.Column(db.String(255), nullable=False)

    __table_args__ = (
        db.UniqueConstraint("team_id", "key", name="uq_settings_team_key"),
    )

SETTINGS_DEFAULTS = {
    "max_normal_shifts": "6",
    "max_thursday_shifts": "1",
    "max_weekend_shifts": "1",
    "justice_lookback_months": "0",
    "min_days_between_shifts": "1",
    "shotef_enabled": "true",
    "shotef_settled_at": "",
    "fairness_mode": "count",
    "min_shifts_per_month": "0",
    "enable_rebalancing": "false",
    "active_days": "0,1,2,3,4,5,6",
}
