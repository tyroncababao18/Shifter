from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Team(db.Model):
    __tablename__ = "teams"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
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
            "shotef_credit": self.shotef_credit,
            "shift_count": shift_count if shift_count is not None else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Unavailability(db.Model):
    __tablename__ = "unavailability"
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey("members.id"), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, index=True)
    reason = db.Column(db.String(255), nullable=True)
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
}
