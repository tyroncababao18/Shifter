"""Bootstrap seed script for auth test users and default organization."""
from models import db, User, Organization, OrganizationMembership, Team, TeamMembership


def seed_auth_data():
    """Create test users and default org if they don't exist. Safe to run multiple times."""

    # 1. Default organization
    org = Organization.query.filter_by(name="Test Organization").first()
    if not org:
        org = Organization(name="Test Organization")
        db.session.add(org)
        db.session.flush()

    # 2. Default team (or assign first existing team)
    team = Team.query.filter_by(organization_id=org.id).first()
    if not team:
        existing_team = Team.query.first()
        if existing_team and not existing_team.organization_id:
            existing_team.organization_id = org.id
            team = existing_team
        else:
            team = Team(name="Default Team", organization_id=org.id)
            db.session.add(team)
            db.session.flush()

    # Assign any unassigned teams to the default org
    unassigned = Team.query.filter_by(organization_id=None).all()
    for t in unassigned:
        t.organization_id = org.id

    # 3. Test users
    users_to_create = [
        {
            "email": "admin@shifter.local",
            "password": "admin123",
            "first_name": "Shifter",
            "last_name": "Admin",
            "platform_role": "shifter_admin",
            "org_role": None,
            "team_role": None,
        },
        {
            "email": "orgadmin@shifter.local",
            "password": "admin123",
            "first_name": "Org",
            "last_name": "Admin",
            "platform_role": "none",
            "org_role": "organization_admin",
            "team_role": None,
        },
        {
            "email": "teamadmin@shifter.local",
            "password": "admin123",
            "first_name": "Team",
            "last_name": "Admin",
            "platform_role": "none",
            "org_role": "member",
            "team_role": "team_admin",
        },
        {
            "email": "employee@shifter.local",
            "password": "admin123",
            "first_name": "Test",
            "last_name": "Employee",
            "platform_role": "none",
            "org_role": "member",
            "team_role": "employee",
        },
    ]

    for u_data in users_to_create:
        existing = User.query.filter_by(email=u_data["email"]).first()
        if existing:
            continue

        user = User(
            email=u_data["email"],
            first_name=u_data["first_name"],
            last_name=u_data["last_name"],
            platform_role=u_data["platform_role"],
            must_change_password=True,
        )
        user.set_password(u_data["password"])
        db.session.add(user)
        db.session.flush()

        # Org membership
        if u_data["org_role"]:
            db.session.add(OrganizationMembership(
                user_id=user.id, organization_id=org.id, org_role=u_data["org_role"]
            ))

        # Team membership
        if u_data["team_role"]:
            db.session.add(TeamMembership(
                user_id=user.id, team_id=team.id, team_role=u_data["team_role"]
            ))

    db.session.commit()
    print("Auth seed data created successfully.")
    print("Test users: admin@shifter.local, orgadmin@shifter.local, teamadmin@shifter.local, employee@shifter.local")
    print("Password for all: admin123")
