"""Authentication routes blueprint."""
from flask import Blueprint, request, jsonify, g

from models import db, User
from auth import create_token, login_required, get_user_context

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401

    if not user.is_active:
        return jsonify({"error": "Account is deactivated"}), 403

    token = create_token(user.id)
    return jsonify({
        "token": token,
        "user": get_user_context(user),
    })


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    # Stateless JWT — client discards the token
    return jsonify({"message": "Logged out"})


@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    return jsonify({"user": get_user_context(g.current_user)})


@auth_bp.route("/password", methods=["PUT"])
@login_required
def change_password():
    data = request.get_json() or {}
    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""

    if not current_password or not new_password:
        return jsonify({"error": "Current and new passwords are required"}), 400

    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    user = g.current_user
    if not user.check_password(current_password):
        return jsonify({"error": "Current password is incorrect"}), 401

    user.set_password(new_password)
    user.must_change_password = False
    db.session.commit()
    return jsonify({"message": "Password changed", "user": get_user_context(user)})


@auth_bp.route("/force-password-change", methods=["PUT"])
@login_required
def force_password_change():
    """First-login password change — does not require current password."""
    data = request.get_json() or {}
    new_password = data.get("new_password") or ""

    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    user = g.current_user
    if not user.must_change_password:
        return jsonify({"error": "Password change not required"}), 400

    user.set_password(new_password)
    user.must_change_password = False
    db.session.commit()
    return jsonify({"message": "Password changed", "user": get_user_context(user)})
