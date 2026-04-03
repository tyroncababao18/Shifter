# Shifter

A fair, automated shift scheduling system for teams. Built with **Flask** (Python) and **React** (TypeScript).

Shifter takes the pain out of building monthly shift rotations. It balances workload across team members using a smart fairness algorithm that considers historical shifts, swap debts, availability ratios, member weights, per-type caps, and configurable rest gaps — so no one gets stuck with all the bad shifts.

---

## Screenshots

### Dashboard
Overview of all teams with key stats at a glance.

![Dashboard](docs/screenshots/dashboard.png)

### Team Members
Manage members, view shift counts, swap balances, and roles.

![Team Detail](docs/screenshots/team-detail.png)

### Schedule
Dual calendar view — night shifts and day shifts side by side, with swap tracking and availability badges.

![Schedule](docs/screenshots/schedule.png)

### Past Shifts
Browse historical shift data month by month — full calendar of color-coded night shift assignments.

![Past Shifts](docs/screenshots/past-shifts.png)

### Reports
Per-member shift distribution with fairness metrics across all teams.

![Reports](docs/screenshots/reports.png)

### Settings
Configure shift caps, rest gaps, fairness mode, and algorithm behavior — globally or per team.

![Settings](docs/screenshots/settings.png)

---

## Features

- **Automatic schedule generation** — one click to build a fair monthly rotation
- **Smart fairness algorithm** — two modes:
  - **Count mode** (default) — balances by total shift count, swap debts, and per-type history
  - **Ratio mode** — normalizes fairness by each member's availability, so members available less often aren't overloaded
- **Member weights** — assign a load factor per member (e.g., 0.5 = half the shifts) for part-timers or special roles
- **Minimum participation** — configurable floor ensures every member gets at least N shifts per month
- **Rebalancing pass** — optional second pass swaps assignments between over- and under-loaded members for tighter fairness
- **Day shifts** — optional weekly Sun-Thu day shift rotation with independent fairness tracking
- **Night shifts** — the core scheduling: daily night shift assignments with weekend pairing (Fri-Sat)
- **Shift swaps** — trade shifts between members with automatic debt tracking
- **Availability management** — members mark unavailable dates; the scheduler works around them
- **Weekend pairing** — Friday-Saturday shifts are automatically assigned to the same member
- **Past shift import** — backfill historical data so the algorithm has full context
- **Excel export** — download any month's schedule as an `.xlsx` file
- **Per-team settings** — configure all algorithm parameters globally or per team
- **Random picker** — utility for ad-hoc random member selection
- **Modern UI** — responsive React app with Tailwind CSS
- **REST API** — clean JSON API, easy to integrate with other tools

---

## Scheduling Algorithm

Shifter's scheduling engine is a configurable, multi-phase assignment system:

### Phase 1: Justice Computation
For each member, compute an **effective shift count** considering:
- Historical shifts (within a configurable lookback window or all-time)
- Swap debt (covering others' shifts reduces your burden)
- Manual credit adjustments

### Phase 2: Minimum Participation (optional)
If `min_shifts_per_month > 0`, a pre-pass ensures members with limited availability are guaranteed their minimum shifts before the main loop runs.

### Phase 3: Greedy Assignment
Day-by-day, the algorithm selects the best candidate for each shift:
- Filters by availability, gap constraints, and monthly caps
- Sorts candidates using the configured fairness mode:
  - **Count**: `(type_count, past_count, monthly_total, random)`
  - **Ratio**: `(burden_ratio, type_count, random)` where `burden = weighted_shifts / available_days`
- Weekend shifts (Fri-Sat) are paired automatically

### Phase 4: Rebalancing (optional)
When enabled, a second pass identifies the most- and least-burdened members and swaps assignments to reduce the fairness spread — respecting all constraints.

### Configuration

All algorithm settings are configurable per team via the Admin Settings page:

| Setting | Default | Description |
|---------|---------|-------------|
| `max_normal_shifts` | 6 | Max Sun-Wed shifts per member per month |
| `max_thursday_shifts` | 1 | Max Thursday shifts per member per month |
| `max_weekend_shifts` | 1 | Max Fri-Sat pair shifts per member per month |
| `min_days_between_shifts` | 1 | Minimum gap between consecutive shifts |
| `justice_lookback_months` | 0 | Months of history to consider (0 = all-time) |
| `fairness_mode` | count | `count` (absolute) or `ratio` (availability-weighted) |
| `min_shifts_per_month` | 0 | Minimum shifts per member (0 = disabled) |
| `enable_rebalancing` | false | Run a second pass to improve fairness spread |

Each member also has a **shift weight** (default 1.0). A weight of 0.5 means the member is expected to take half the normal load — useful for part-timers or members with other responsibilities.

---

## Tech Stack

| Layer    | Technology                              |
|----------|-----------------------------------------|
| Backend  | Python, Flask, SQLAlchemy, PostgreSQL / SQLite |
| Frontend | React, TypeScript, Vite, Tailwind CSS   |
| Other    | Axios, dayjs, openpyxl, Lucide icons    |

---

## Getting Started

### Prerequisites

- **Python 3.10+**
- **Node.js 18+** and **npm**
- (Optional) PostgreSQL — SQLite works out of the box for development

### Backend Setup

```bash
cd backend

# Create a virtual environment
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy the env template and edit if needed
cp .env.example .env
# By default it uses SQLite — no database server required.
# For PostgreSQL, edit .env and set:
#   DATABASE_URL=postgresql://user:pass@localhost:5432/shifter

# Run the server
python app.py
```

The API starts at `http://localhost:5001`. All database tables are created automatically on first run — no manual migration needed.

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The frontend starts at `http://localhost:5173` and proxies API requests to the backend.

### Seed Test Data (Optional)

```bash
cd backend
python seed_test_data.py
```

This creates sample teams, members, and historical shift data so you can explore the app immediately.

---

## Project Structure

```
shifter/
├── backend/
│   ├── app.py              # Flask routes, API endpoints, day shift generation
│   ├── models.py           # SQLAlchemy models (Team, Member, Shift, etc.)
│   ├── scheduling/         # Scheduling algorithm package
│   │   ├── __init__.py     # Main create_schedule orchestrator
│   │   ├── types.py        # MemberState, ScheduleConfig dataclasses
│   │   ├── fairness.py     # Sort key strategies (count & ratio modes)
│   │   ├── constraints.py  # Eligibility filters, min participation
│   │   └── rebalancer.py   # Post-pass rebalancing algorithm
│   ├── seed_test_data.py   # Test data seeder
│   └── requirements.txt    # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── api.ts          # Axios API client & TypeScript interfaces
│   │   ├── components/     # Shared UI components (Layout, Modal, etc.)
│   │   └── pages/          # Page components (Dashboard, Schedule, etc.)
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

---

## Usage

1. **Create a team** on the Dashboard
2. **Add members** to the team — set shift weights for part-timers if needed
3. **Set availability** — open the Schedule page, click Availability, mark unavailable dates
4. **Configure** — in Settings, choose fairness mode, set minimum participation, enable rebalancing
5. **Generate** — click Generate to build the monthly rotation
6. **Review & adjust** — swap shifts, manually assign empty slots, edit assignments inline
7. **Export** — download the schedule as Excel

---

## Contributing

Contributions are welcome! Whether it's bug fixes, new features, documentation improvements, or UI polish — all help is appreciated.

### How to Contribute

1. **Fork** the repository
2. **Create a branch** for your feature or fix (`git checkout -b feature/my-feature`)
3. **Make your changes** and ensure linting passes
4. **Test** your changes locally (run both backend and frontend)
5. **Commit** with a clear message describing what and why
6. **Open a Pull Request** against `main`

### Guidelines

- Keep PRs focused — one feature or fix per PR
- Follow existing code style (Python: PEP 8, TypeScript: existing conventions)
- Add or update documentation for new features
- Be respectful and constructive in discussions

### Reporting Issues

Found a bug or have a feature request? [Open an issue](../../issues) with:
- A clear title and description
- Steps to reproduce (for bugs)
- Expected vs. actual behavior

---

## License

This project is licensed under the [MIT License](LICENSE).

---

Built with care for every manager out there, by [Tamir Manasherov](https://github.com/tamirmanasherov).
