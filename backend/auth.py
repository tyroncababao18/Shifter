"""Authentication & authorization helpers for Shifter."""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from functools import wraps

import jwt
from flask import request, jsonify, g

from models import db, User, OrganizationMembership, TeamMembership, Team

JWT_SECRET = os.environ.get("SECRET_KEY", "superSecretKey")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24


# ── Token helpers ──

def create_token(user_id: int) -> str:
    payload = {
        "user_id": user_id,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def get_current_user() -> User | None:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    payload = decode_token(token)
    if not payload:
        return None
    return User.query.get(payload["user_id"])


# ── Decorators ──

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        if not user.is_active:
            return jsonify({"error": "Account is deactivated"}), 403
        g.current_user = user
        return f(*args, **kwargs)
    return decorated


def require_platform_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = g.current_user
        if user.platform_role != "shifter_admin":
            return jsonify({"error": "Platform admin access required"}), 403
        return f(*args, **kwargs)
    return decorated


# ── Permission check helpers ──

def is_shifter_admin(user: User) -> bool:
    return user.platform_role == "shifter_admin"


def is_org_admin(user: User, org_id: int) -> bool:
    if is_shifter_admin(user):
        return True
    m = OrganizationMembership.query.filter_by(user_id=user.id, organization_id=org_id).first()
    return m is not None and m.org_role == "organization_admin"


def is_org_member(user: User, org_id: int) -> bool:
    if is_shifter_admin(user):
        return True
    return OrganizationMembership.query.filter_by(user_id=user.id, organization_id=org_id).first() is not None


def is_team_admin(user: User, team_id: int) -> bool:
    if is_shifter_admin(user):
        return True
    team = Team.query.get(team_id)
    if team and team.organization_id:
        if is_org_admin(user, team.organization_id):
            return True
    m = TeamMembership.query.filter_by(user_id=user.id, team_id=team_id).first()
    return m is not None and m.team_role == "team_admin"


def is_team_member(user: User, team_id: int) -> bool:
    if is_shifter_admin(user):
        return True
    team = Team.query.get(team_id)
    if team and team.organization_id:
        if is_org_admin(user, team.organization_id):
            return True
    return TeamMembership.query.filter_by(user_id=user.id, team_id=team_id).first() is not None


def get_user_context(user: User) -> dict:
    """Build full context of user's orgs, teams, and roles for the /me endpoint."""
    orgs = []
    for om in user.org_memberships:
        org = om.organization
        orgs.append({
            "id": org.id,
            "name": org.name,
            "org_role": om.org_role,
        })

    teams = []
    for tm in user.team_memberships:
        t = tm.team
        teams.append({
            "id": t.id,
            "name": t.name,
            "organization_id": t.organization_id,
            "team_role": tm.team_role,
        })

    return {
        **user.to_dict(),
        "organizations": orgs,
        "teams": teams,
    }


def get_accessible_team_ids(user: User) -> list[int] | None:
    """Return list of team IDs user can access, or None if they can access all (shifter_admin)."""
    if is_shifter_admin(user):
        return None  # access all

    team_ids = set()

    # Direct team memberships
    for tm in user.team_memberships:
        team_ids.add(tm.team_id)

    # Org admin sees all teams in their orgs
    for om in user.org_memberships:
        if om.org_role == "organization_admin":
            org_teams = Team.query.filter_by(organization_id=om.organization_id).all()
            for t in org_teams:
                team_ids.add(t.id)

    return list(team_ids)
