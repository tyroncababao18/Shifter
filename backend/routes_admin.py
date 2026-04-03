"""Admin routes for organization, user, and role management."""
from flask import Blueprint, request, jsonify, g

from models import db, User, Organization, OrganizationMembership, Team, TeamMembership
from auth import (
    login_required, require_platform_admin,
    is_shifter_admin, is_org_admin, is_org_member, is_team_admin,
)

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


# ── Organization CRUD (Shifter Admin only) ──

@admin_bp.route("/organizations", methods=["GET"])
@login_required
def list_organizations():
    user = g.current_user
    if is_shifter_admin(user):
        orgs = Organization.query.order_by(Organization.name).all()
    else:
        org_ids = [om.organization_id for om in user.org_memberships]
        orgs = Organization.query.filter(Organization.id.in_(org_ids)).order_by(Organization.name).all()

    result = []
    for o in orgs:
        d = o.to_dict()
        d["member_count"] = OrganizationMembership.query.filter_by(organization_id=o.id).count()
        d["team_count"] = Team.query.filter_by(organization_id=o.id).count()
        result.append(d)
    return jsonify({"organizations": result})


@admin_bp.route("/organizations", methods=["POST"])
@login_required
@require_platform_admin
def create_organization():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Organization name is required"}), 400
    if Organization.query.filter_by(name=name).first():
        return jsonify({"error": "Organization name already exists"}), 400

    org = Organization(name=name)
    db.session.add(org)
    db.session.commit()
    return jsonify(org.to_dict()), 201


@admin_bp.route("/organizations/<int:org_id>", methods=["GET"])
@login_required
def get_organization(org_id):
    user = g.current_user
    if not is_shifter_admin(user) and not is_org_member(user, org_id):
        return jsonify({"error": "Access denied"}), 403

    org = Organization.query.get_or_404(org_id)
    teams = Team.query.filter_by(organization_id=org_id).order_by(Team.name).all()
    members = (
        db.session.query(User, OrganizationMembership)
        .join(OrganizationMembership, User.id == OrganizationMembership.user_id)
        .filter(OrganizationMembership.organization_id == org_id)
        .all()
    )

    return jsonify({
        "organization": org.to_dict(),
        "teams": [t.to_dict() for t in teams],
        "members": [
            {**u.to_dict(), "org_role": om.org_role, "membership_id": om.id}
            for u, om in members
        ],
    })


@admin_bp.route("/organizations/<int:org_id>", methods=["PUT"])
@login_required
def update_organization(org_id):
    user = g.current_user
    if not is_org_admin(user, org_id):
        return jsonify({"error": "Organization admin access required"}), 403

    org = Organization.query.get_or_404(org_id)
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if name and name != org.name:
        if Organization.query.filter_by(name=name).first():
            return jsonify({"error": "Organization name already exists"}), 400
        org.name = name
    db.session.commit()
    return jsonify(org.to_dict())


@admin_bp.route("/organizations/<int:org_id>", methods=["DELETE"])
@login_required
@require_platform_admin
def delete_organization(org_id):
    org = Organization.query.get_or_404(org_id)
    db.session.delete(org)
    db.session.commit()
    return jsonify({"message": "Organization deleted"})


# ── Organization membership ──

@admin_bp.route("/organizations/<int:org_id>/members", methods=["POST"])
@login_required
def add_org_member(org_id):
    user = g.current_user
    if not is_org_admin(user, org_id):
        return jsonify({"error": "Organization admin access required"}), 403

    Organization.query.get_or_404(org_id)
    data = request.get_json() or {}
    user_id = data.get("user_id")
    org_role = data.get("org_role", "member")

    if not user_id:
        return jsonify({"error": "user_id is required"}), 400
    if org_role not in ("organization_admin", "member"):
        return jsonify({"error": "Invalid org_role"}), 400

    target_user = User.query.get_or_404(user_id)
    existing = OrganizationMembership.query.filter_by(user_id=user_id, organization_id=org_id).first()
    if existing:
        return jsonify({"error": "User is already a member of this organization"}), 400

    om = OrganizationMembership(user_id=user_id, organization_id=org_id, org_role=org_role)
    db.session.add(om)
    db.session.commit()
    return jsonify(om.to_dict()), 201


@admin_bp.route("/organizations/<int:org_id>/members/<int:user_id>", methods=["PUT"])
@login_required
def update_org_member(org_id, user_id):
    user = g.current_user
    if not is_org_admin(user, org_id):
        return jsonify({"error": "Organization admin access required"}), 403

    om = OrganizationMembership.query.filter_by(user_id=user_id, organization_id=org_id).first_or_404()
    data = request.get_json() or {}
    org_role = data.get("org_role")
    if org_role and org_role in ("organization_admin", "member"):
        om.org_role = org_role
    db.session.commit()
    return jsonify(om.to_dict())


@admin_bp.route("/organizations/<int:org_id>/members/<int:user_id>", methods=["DELETE"])
@login_required
def remove_org_member(org_id, user_id):
    user = g.current_user
    if not is_org_admin(user, org_id):
        return jsonify({"error": "Organization admin access required"}), 403

    om = OrganizationMembership.query.filter_by(user_id=user_id, organization_id=org_id).first_or_404()
    # Also remove team memberships in this org
    org_teams = Team.query.filter_by(organization_id=org_id).all()
    for t in org_teams:
        tm = TeamMembership.query.filter_by(user_id=user_id, team_id=t.id).first()
        if tm:
            db.session.delete(tm)
    db.session.delete(om)
    db.session.commit()
    return jsonify({"message": "Member removed from organization"})


# ── Team membership ──

@admin_bp.route("/teams/<int:team_id>/members", methods=["GET"])
@login_required
def list_team_members(team_id):
    user = g.current_user
    if not is_team_admin(user, team_id) and not is_shifter_admin(user):
        # Allow team members to view
        tm = TeamMembership.query.filter_by(user_id=user.id, team_id=team_id).first()
        if not tm:
            return jsonify({"error": "Access denied"}), 403

    members = (
        db.session.query(User, TeamMembership)
        .join(TeamMembership, User.id == TeamMembership.user_id)
        .filter(TeamMembership.team_id == team_id)
        .all()
    )
    return jsonify({
        "members": [
            {**u.to_dict(), "team_role": tm.team_role, "membership_id": tm.id}
            for u, tm in members
        ]
    })


@admin_bp.route("/teams/<int:team_id>/members", methods=["POST"])
@login_required
def add_team_member(team_id):
    user = g.current_user
    if not is_team_admin(user, team_id):
        return jsonify({"error": "Team admin access required"}), 403

    team = Team.query.get_or_404(team_id)
    data = request.get_json() or {}
    user_id = data.get("user_id")
    team_role = data.get("team_role", "employee")

    if not user_id:
        return jsonify({"error": "user_id is required"}), 400
    if team_role not in ("team_admin", "employee"):
        return jsonify({"error": "Invalid team_role"}), 400

    target_user = User.query.get_or_404(user_id)
    existing = TeamMembership.query.filter_by(user_id=user_id, team_id=team_id).first()
    if existing:
        return jsonify({"error": "User is already a member of this team"}), 400

    # Auto-add to org if not already a member
    if team.organization_id:
        org_mem = OrganizationMembership.query.filter_by(
            user_id=user_id, organization_id=team.organization_id
        ).first()
        if not org_mem:
            db.session.add(OrganizationMembership(
                user_id=user_id, organization_id=team.organization_id, org_role="member"
            ))

    tm = TeamMembership(user_id=user_id, team_id=team_id, team_role=team_role)
    db.session.add(tm)
    db.session.commit()
    return jsonify(tm.to_dict()), 201


@admin_bp.route("/teams/<int:team_id>/members/<int:user_id>", methods=["PUT"])
@login_required
def update_team_member(team_id, user_id):
    user = g.current_user
    if not is_team_admin(user, team_id):
        return jsonify({"error": "Team admin access required"}), 403

    tm = TeamMembership.query.filter_by(user_id=user_id, team_id=team_id).first_or_404()
    data = request.get_json() or {}
    team_role = data.get("team_role")
    if team_role and team_role in ("team_admin", "employee"):
        tm.team_role = team_role
    db.session.commit()
    return jsonify(tm.to_dict())


@admin_bp.route("/teams/<int:team_id>/members/<int:user_id>", methods=["DELETE"])
@login_required
def remove_team_member(team_id, user_id):
    user = g.current_user
    if not is_team_admin(user, team_id):
        return jsonify({"error": "Team admin access required"}), 403

    tm = TeamMembership.query.filter_by(user_id=user_id, team_id=team_id).first_or_404()
    db.session.delete(tm)
    db.session.commit()
    return jsonify({"message": "Member removed from team"})


# ── User CRUD ──

@admin_bp.route("/users", methods=["GET"])
@login_required
def list_users():
    user = g.current_user
    if is_shifter_admin(user):
        users = User.query.order_by(User.email).all()
    else:
        # Org admins see users in their orgs
        org_ids = [om.organization_id for om in user.org_memberships if om.org_role == "organization_admin"]
        if not org_ids:
            return jsonify({"users": []})
        user_ids = [om.user_id for om in OrganizationMembership.query.filter(
            OrganizationMembership.organization_id.in_(org_ids)
        ).all()]
        users = User.query.filter(User.id.in_(set(user_ids))).order_by(User.email).all()

    return jsonify({"users": [u.to_dict() for u in users]})


@admin_bp.route("/users", methods=["POST"])
@login_required
def create_user():
    user = g.current_user
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    first_name = (data.get("first_name") or "").strip()
    last_name = (data.get("last_name") or "").strip()
    platform_role = data.get("platform_role", "none")
    org_id = data.get("organization_id")
    team_id = data.get("team_id")
    org_role = data.get("org_role", "member")
    team_role = data.get("team_role", "employee")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already exists"}), 400

    # Permission checks
    if platform_role == "shifter_admin" and not is_shifter_admin(user):
        return jsonify({"error": "Only Shifter Admin can create platform admins"}), 403

    if org_id and not is_org_admin(user, org_id):
        return jsonify({"error": "You don't have admin access to this organization"}), 403

    if team_id and not is_team_admin(user, team_id):
        return jsonify({"error": "You don't have admin access to this team"}), 403

    new_user = User(
        email=email,
        first_name=first_name,
        last_name=last_name,
        platform_role=platform_role,
        must_change_password=data.get("must_change_password", True),
    )
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.flush()

    # Add to organization
    if org_id:
        db.session.add(OrganizationMembership(
            user_id=new_user.id, organization_id=org_id, org_role=org_role
        ))

    # Add to team (auto-add to org if needed)
    if team_id:
        team = Team.query.get(team_id)
        if team and team.organization_id and not org_id:
            existing_om = OrganizationMembership.query.filter_by(
                user_id=new_user.id, organization_id=team.organization_id
            ).first()
            if not existing_om:
                db.session.add(OrganizationMembership(
                    user_id=new_user.id, organization_id=team.organization_id, org_role="member"
                ))
        db.session.add(TeamMembership(
            user_id=new_user.id, team_id=team_id, team_role=team_role
        ))

    db.session.commit()
    return jsonify(new_user.to_dict()), 201


@admin_bp.route("/users/<int:user_id>", methods=["GET"])
@login_required
def get_user(user_id):
    from auth import get_user_context
    target = User.query.get_or_404(user_id)
    return jsonify({"user": get_user_context(target)})


@admin_bp.route("/users/<int:user_id>", methods=["PUT"])
@login_required
def update_user(user_id):
    user = g.current_user
    target = User.query.get_or_404(user_id)
    data = request.get_json() or {}

    # Only shifter admin can change platform_role
    if "platform_role" in data and not is_shifter_admin(user):
        return jsonify({"error": "Only Shifter Admin can change platform roles"}), 403

    if "email" in data:
        email = data["email"].strip().lower()
        if email != target.email:
            if User.query.filter_by(email=email).first():
                return jsonify({"error": "Email already exists"}), 400
            target.email = email
    if "first_name" in data:
        target.first_name = data["first_name"]
    if "last_name" in data:
        target.last_name = data["last_name"]
    if "is_active" in data:
        target.is_active = bool(data["is_active"])
    if "platform_role" in data:
        target.platform_role = data["platform_role"]

    db.session.commit()
    return jsonify(target.to_dict())


@admin_bp.route("/users/<int:user_id>", methods=["DELETE"])
@login_required
def delete_user(user_id):
    user = g.current_user
    target = User.query.get_or_404(user_id)

    if target.id == user.id:
        return jsonify({"error": "Cannot delete your own account"}), 400

    if target.platform_role == "shifter_admin" and not is_shifter_admin(user):
        return jsonify({"error": "Only Shifter Admin can delete platform admins"}), 403

    db.session.delete(target)
    db.session.commit()
    return jsonify({"message": "User deleted"})


@admin_bp.route("/users/<int:user_id>/reset-password", methods=["PUT"])
@login_required
def reset_password(user_id):
    user = g.current_user
    target = User.query.get_or_404(user_id)
    data = request.get_json() or {}
    new_password = data.get("new_password") or ""

    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    # Shifter admin can reset anyone
    if is_shifter_admin(user):
        pass
    else:
        # Org admin can reset users in their orgs
        allowed = False
        admin_org_ids = [om.organization_id for om in user.org_memberships if om.org_role == "organization_admin"]
        if admin_org_ids:
            target_org_ids = [om.organization_id for om in target.org_memberships]
            if any(oid in admin_org_ids for oid in target_org_ids):
                allowed = True
        if not allowed:
            return jsonify({"error": "You don't have permission to reset this user's password"}), 403

    target.set_password(new_password)
    target.must_change_password = True
    db.session.commit()
    return jsonify({"message": "Password reset successfully"})
