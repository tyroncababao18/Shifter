"""Tests for leave management API endpoints."""
import os
import sys
import json
import unittest
from datetime import date, datetime

# Use an in-memory SQLite DB for tests
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-secret"

from app import app
from models import db, User, Organization, OrganizationMembership, Team, TeamMembership, Member
from auth import create_token


class LeaveTestCase(unittest.TestCase):
    """Test leave request CRUD + approval workflow."""

    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()
        with app.app_context():
            db.create_all()
            # Seed: org, team, admin user, employee user, member
            admin = User(email="admin@test.com", platform_role="none")
            admin.set_password("pass")
            employee = User(email="emp@test.com", platform_role="none")
            employee.set_password("pass")
            db.session.add_all([admin, employee])
            db.session.flush()

            org = Organization(name="TestOrg")
            db.session.add(org)
            db.session.flush()

            db.session.add(OrganizationMembership(user_id=admin.id, organization_id=org.id, org_role="organization_admin"))
            db.session.add(OrganizationMembership(user_id=employee.id, organization_id=org.id, org_role="member"))

            team = Team(name="Alpha", organization_id=org.id)
            db.session.add(team)
            db.session.flush()

            db.session.add(TeamMembership(user_id=admin.id, team_id=team.id, team_role="team_admin"))
            db.session.add(TeamMembership(user_id=employee.id, team_id=team.id, team_role="employee"))

            member = Member(name="John", team_id=team.id)
            db.session.add(member)
            db.session.commit()

            self.admin_id = admin.id
            self.employee_id = employee.id
            self.team_id = team.id
            self.member_id = member.id
            self.admin_token = create_token(admin.id)
            self.emp_token = create_token(employee.id)

    def tearDown(self):
        with app.app_context():
            db.drop_all()

    def _auth(self, token):
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # ── Create ──

    def test_create_leave_request(self):
        resp = self.client.post(
            f"/api/teams/{self.team_id}/leave-requests",
            headers=self._auth(self.emp_token),
            data=json.dumps({
                "member_id": self.member_id,
                "leave_type": "vacation",
                "start_date": "2026-05-01",
                "end_date": "2026-05-03",
                "notes": "Family trip",
            }),
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.get_json()
        self.assertEqual(data["status"], "pending")
        self.assertEqual(data["leave_type"], "vacation")
        self.assertEqual(data["member_name"], "John")

    def test_create_invalid_type(self):
        resp = self.client.post(
            f"/api/teams/{self.team_id}/leave-requests",
            headers=self._auth(self.emp_token),
            data=json.dumps({
                "member_id": self.member_id,
                "leave_type": "invalid",
                "start_date": "2026-05-01",
                "end_date": "2026-05-01",
            }),
        )
        self.assertEqual(resp.status_code, 400)

    def test_create_end_before_start(self):
        resp = self.client.post(
            f"/api/teams/{self.team_id}/leave-requests",
            headers=self._auth(self.emp_token),
            data=json.dumps({
                "member_id": self.member_id,
                "leave_type": "sick",
                "start_date": "2026-05-05",
                "end_date": "2026-05-01",
            }),
        )
        self.assertEqual(resp.status_code, 400)

    def test_partial_day_multi_day_rejected(self):
        resp = self.client.post(
            f"/api/teams/{self.team_id}/leave-requests",
            headers=self._auth(self.emp_token),
            data=json.dumps({
                "member_id": self.member_id,
                "leave_type": "personal",
                "start_date": "2026-05-01",
                "end_date": "2026-05-03",
                "partial_day": "morning",
            }),
        )
        self.assertEqual(resp.status_code, 400)

    # ── Approve ──

    def test_approve_creates_unavailabilities(self):
        # Create request
        resp = self.client.post(
            f"/api/teams/{self.team_id}/leave-requests",
            headers=self._auth(self.emp_token),
            data=json.dumps({
                "member_id": self.member_id,
                "leave_type": "vacation",
                "start_date": "2026-05-01",
                "end_date": "2026-05-03",
            }),
        )
        lr_id = resp.get_json()["id"]

        # Approve as admin
        resp = self.client.post(
            f"/api/leave-requests/{lr_id}/approve",
            headers=self._auth(self.admin_token),
            data=json.dumps({"review_notes": "Enjoy!"}),
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["status"], "approved")

        # Verify unavailabilities were created (3 days)
        resp = self.client.get(
            f"/api/members/{self.member_id}/unavailabilities",
            headers=self._auth(self.admin_token),
        )
        unavs = resp.get_json()["unavailabilities"]
        leave_unavs = [u for u in unavs if u["leave_type"] == "vacation"]
        self.assertEqual(len(leave_unavs), 3)

    def test_employee_cannot_approve(self):
        resp = self.client.post(
            f"/api/teams/{self.team_id}/leave-requests",
            headers=self._auth(self.emp_token),
            data=json.dumps({
                "member_id": self.member_id,
                "leave_type": "sick",
                "start_date": "2026-06-01",
                "end_date": "2026-06-01",
            }),
        )
        lr_id = resp.get_json()["id"]

        resp = self.client.post(
            f"/api/leave-requests/{lr_id}/approve",
            headers=self._auth(self.emp_token),
        )
        self.assertEqual(resp.status_code, 403)

    # ── Reject ──

    def test_reject(self):
        resp = self.client.post(
            f"/api/teams/{self.team_id}/leave-requests",
            headers=self._auth(self.emp_token),
            data=json.dumps({
                "member_id": self.member_id,
                "leave_type": "personal",
                "start_date": "2026-07-01",
                "end_date": "2026-07-01",
            }),
        )
        lr_id = resp.get_json()["id"]

        resp = self.client.post(
            f"/api/leave-requests/{lr_id}/reject",
            headers=self._auth(self.admin_token),
            data=json.dumps({"review_notes": "Bad timing"}),
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["status"], "rejected")

    # ── Cancel / Revoke ──

    def test_cancel_pending(self):
        resp = self.client.post(
            f"/api/teams/{self.team_id}/leave-requests",
            headers=self._auth(self.emp_token),
            data=json.dumps({
                "member_id": self.member_id,
                "leave_type": "vacation",
                "start_date": "2026-08-01",
                "end_date": "2026-08-01",
            }),
        )
        lr_id = resp.get_json()["id"]

        resp = self.client.delete(
            f"/api/leave-requests/{lr_id}",
            headers=self._auth(self.emp_token),
        )
        self.assertEqual(resp.status_code, 200)

    def test_revoke_approved_removes_unavailabilities(self):
        # Create + approve
        resp = self.client.post(
            f"/api/teams/{self.team_id}/leave-requests",
            headers=self._auth(self.emp_token),
            data=json.dumps({
                "member_id": self.member_id,
                "leave_type": "vacation",
                "start_date": "2026-09-01",
                "end_date": "2026-09-02",
            }),
        )
        lr_id = resp.get_json()["id"]
        self.client.post(
            f"/api/leave-requests/{lr_id}/approve",
            headers=self._auth(self.admin_token),
        )

        # Revoke as admin
        resp = self.client.delete(
            f"/api/leave-requests/{lr_id}",
            headers=self._auth(self.admin_token),
        )
        self.assertEqual(resp.status_code, 200)

        # Verify unavailabilities removed
        resp = self.client.get(
            f"/api/members/{self.member_id}/unavailabilities",
            headers=self._auth(self.admin_token),
        )
        unavs = resp.get_json()["unavailabilities"]
        leave_unavs = [u for u in unavs if u.get("leave_request_id")]
        self.assertEqual(len(leave_unavs), 0)

    # ── List / Filter ──

    def test_list_with_status_filter(self):
        # Create two requests
        for lt in ["vacation", "sick"]:
            self.client.post(
                f"/api/teams/{self.team_id}/leave-requests",
                headers=self._auth(self.emp_token),
                data=json.dumps({
                    "member_id": self.member_id,
                    "leave_type": lt,
                    "start_date": "2026-10-01",
                    "end_date": "2026-10-01",
                }),
            )

        # All
        resp = self.client.get(
            f"/api/teams/{self.team_id}/leave-requests",
            headers=self._auth(self.admin_token),
        )
        self.assertEqual(len(resp.get_json()["leave_requests"]), 2)

        # Filter pending
        resp = self.client.get(
            f"/api/teams/{self.team_id}/leave-requests?status=pending",
            headers=self._auth(self.admin_token),
        )
        self.assertEqual(len(resp.get_json()["leave_requests"]), 2)

    # ── Recurring ──

    def test_recurring_crud(self):
        # Create
        resp = self.client.post(
            f"/api/members/{self.member_id}/recurring-unavailabilities",
            headers=self._auth(self.emp_token),
            data=json.dumps({
                "day_of_week": 3,
                "frequency": "weekly",
                "reason": "Class",
            }),
        )
        self.assertEqual(resp.status_code, 201)
        rec_id = resp.get_json()["id"]

        # List
        resp = self.client.get(
            f"/api/members/{self.member_id}/recurring-unavailabilities",
            headers=self._auth(self.emp_token),
        )
        self.assertEqual(len(resp.get_json()["recurring_unavailabilities"]), 1)

        # Delete
        resp = self.client.delete(
            f"/api/recurring-unavailabilities/{rec_id}",
            headers=self._auth(self.emp_token),
        )
        self.assertEqual(resp.status_code, 200)

    def test_recurring_apply(self):
        # Add weekly Wednesday pattern
        self.client.post(
            f"/api/members/{self.member_id}/recurring-unavailabilities",
            headers=self._auth(self.emp_token),
            data=json.dumps({
                "day_of_week": 3,
                "frequency": "weekly",
                "reason": "Class",
            }),
        )

        # Apply for a specific month
        resp = self.client.post(
            f"/api/members/{self.member_id}/recurring-unavailabilities/apply",
            headers=self._auth(self.emp_token),
            data=json.dumps({"year": 2026, "month": 5}),
        )
        self.assertEqual(resp.status_code, 200)
        self.assertGreater(resp.get_json()["count"], 0)


if __name__ == "__main__":
    unittest.main()
