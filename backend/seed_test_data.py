"""Seed the Shifter database with sample teams, members, and shift history."""

import requests
import random
from datetime import date, timedelta

BASE = "http://localhost:5001/api"

TEAM_DEFS = [
    {"name": "Alpha Squad", "description": "Primary shift rotation squad"},
    {"name": "Bravo Team", "description": "Secondary rotation, night coverage"},
]

MEMBERS = {
    "Alpha Squad": [
        {"name": "Alice Cohen", "sleeps_in_building": True},
        {"name": "Bob Levi", "sleeps_in_building": False},
        {"name": "Charlie Dahan", "sleeps_in_building": True},
        {"name": "Diana Katz", "sleeps_in_building": False},
        {"name": "Eitan Mor", "sleeps_in_building": False},
        {"name": "Farah Nassar", "sleeps_in_building": True},
    ],
    "Bravo Team": [
        {"name": "Gal Peretz", "sleeps_in_building": False},
        {"name": "Hila Ben-David", "sleeps_in_building": True},
        {"name": "Ido Shapira", "sleeps_in_building": False},
        {"name": "Jasmine Levy", "sleeps_in_building": True},
        {"name": "Kobi Azulay", "sleeps_in_building": False},
    ],
}


def seed():
    for tdef in TEAM_DEFS:
        team = requests.post(f"{BASE}/teams", json=tdef).json()
        team_id = team["id"]
        team_name = team["name"]
        print(f"Created team: {team_name} (id={team_id})")

        member_ids = []
        for mdef in MEMBERS.get(team_name, []):
            res = requests.post(f"{BASE}/teams/{team_id}/members", json={
                "name": mdef["name"],
                "sleeps_in_building": mdef["sleeps_in_building"],
            }).json()
            member_ids.append(res["id"])
            print(f"  Added member: {mdef['name']} (id={res['id']})")

        # Add some past shifts for the last 3 months
        today = date.today()
        for months_back in range(1, 4):
            m = today.month - months_back
            y = today.year
            while m <= 0:
                m += 12
                y -= 1
            first_day = date(y, m, 1)
            for day_offset in range(28):
                d = first_day + timedelta(days=day_offset)
                if d.month != m:
                    break
                if d.weekday() in (5,):
                    continue
                if random.random() < 0.6:
                    mid = random.choice(member_ids)
                    try:
                        requests.post(f"{BASE}/teams/{team_id}/past-shifts", json={
                            "member_id": mid,
                            "shift_dates": [d.isoformat()],
                        })
                    except Exception:
                        pass

        # Add some unavailabilities for the current month
        for mid in member_ids:
            num_unav = random.randint(0, 5)
            for _ in range(num_unav):
                day = random.randint(1, 28)
                d = date(today.year, today.month, day)
                try:
                    requests.post(f"{BASE}/members/{mid}/unavailabilities", json={
                        "date": d.isoformat(),
                        "reason": random.choice(["Personal", "Vacation", "Doctor", "Family", ""]),
                    })
                except Exception:
                    pass

        print(f"  Seeded shift history and unavailabilities for {team_name}")

    print("\nDone! Seed data created.")


if __name__ == "__main__":
    seed()
