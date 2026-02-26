# Shifter

A fair, automated shift scheduling system for teams. Built with **Flask** (Python) and **React** (TypeScript).

Shifter takes the pain out of building monthly shift rotations. It balances workload across team members using a fairness algorithm that considers historical shifts, swap debts, per-type caps, and configurable rest gaps — so no one gets stuck with all the bad shifts.

---

## Screenshots

### Dashboard
Overview of all teams with key stats at a glance.

![Dashboard](docs/screenshots/dashboard.png)

### Team Members
Manage members, view shift counts, swap balances, and roles.

![Team Detail](docs/screenshots/team-detail.png)

### Schedule
Dual calendar view — night shifts and Shotef (day duty) side by side, with swap tracking and availability badges.

![Schedule](docs/screenshots/schedule.png)

### Past Shifts
Browse historical shift data month by month — full calendar of color-coded night shift assignments.

![Past Shifts](docs/screenshots/past-shifts.png)

### Reports
Per-member shift distribution with fairness metrics across all teams.

![Reports](docs/screenshots/reports.png)

### Settings
Configure shift caps, rest gaps, and fairness lookback — globally or per team.

![Settings](docs/screenshots/settings.png)

---

## Features

- **Automatic schedule generation** — one click to build a fair monthly rotation
- **Fairness algorithm** — considers historical shift counts, swap debts, per-type balancing (normal / Thursday / weekend), and credit adjustments
- **Shotef (day duty)** — optional weekly Sun-Thu day-duty rotation with independent fairness tracking
- **Shift swaps** — trade shifts between members with automatic debt tracking
- **Availability management** — members mark unavailable dates; the scheduler works around them
- **Weekend pairing** — Friday-Saturday shifts are automatically assigned to the same member
- **Past shift import** — backfill historical data so the algorithm has full context
- **Excel export** — download any month's schedule as an `.xlsx` file
- **Per-team settings** — configure shift caps, rest gaps, lookback windows, and Shotef per team
- **Random picker** — utility for ad-hoc random member selection
- **Modern UI** — responsive React app with Tailwind CSS
- **REST API** — clean JSON API, easy to integrate with other tools

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
│   ├── app.py              # Flask routes, scheduling engine, API endpoints
│   ├── models.py           # SQLAlchemy models (Team, Member, Shift, etc.)
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
2. **Add members** to the team
3. **Set availability** — open the Schedule page, click Availability, mark unavailable dates
4. **Generate** — click Generate to build the monthly rotation
5. **Review & adjust** — swap shifts, manually assign empty slots, edit assignments inline
6. **Export** — download the schedule as Excel

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
