import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Search } from "lucide-react";

interface Section {
  id: string;
  title: string;
  content: string;
}

const sections: Section[] = [
  {
    id: "overview",
    title: "Overview",
    content: `
      <p><strong>Shifter</strong> is a fair, automated shift scheduling system for teams of any size. It handles night-shift rotation, weekend pairing, day shift assignment, swap tracking, and fairness balancing — all through an intuitive web interface.</p>
      <p>Shifter supports <strong>multi-tenant organizations</strong> with role-based access control, so multiple teams and organizations can be managed from a single platform.</p>
      <p>Use this documentation to learn how to use every feature of Shifter.</p>
    `,
  },
  {
    id: "getting-started",
    title: "Getting Started",
    content: `
      <ol>
        <li><strong>Log in</strong> with your email and password. On first login you'll be asked to change your password.</li>
        <li><strong>Select an organization</strong> (if you belong to more than one) using the dropdown in the header.</li>
        <li><strong>Create a team</strong> from the Dashboard.</li>
        <li><strong>Add members</strong> — the people who will be assigned to shifts.</li>
        <li><strong>Mark unavailability</strong> — for each month, mark dates individual members can't work.</li>
        <li><strong>Generate</strong> the schedule for the month.</li>
        <li>Review results, <strong>swap</strong> shifts if needed, and <strong>export</strong> to Excel.</li>
      </ol>
    `,
  },
  {
    id: "auth",
    title: "Authentication & Roles",
    content: `
      <p>Shifter uses JWT-based authentication with a four-tier role hierarchy.</p>
      <h4>Roles</h4>
      <ul>
        <li><strong>Platform Admin (Shifter Admin):</strong> Full access to all organizations, teams, users, and settings. Can create/delete organizations and manage all users.</li>
        <li><strong>Organization Admin:</strong> Manages teams and members within their organization. Can add users to the org and assign roles.</li>
        <li><strong>Team Admin:</strong> Manages members and schedules for their specific team(s).</li>
        <li><strong>Employee:</strong> Can view their team's schedule and data. Read-only access.</li>
      </ul>
      <h4>Organization Selector</h4>
      <p>Platform Admins and users belonging to multiple organizations can switch between organizations using the dropdown in the top header bar. This filters the Dashboard, Settings, and Reports to show only the selected organization's data.</p>
      <h4>Password Management</h4>
      <p>New users are created with a temporary password and must change it on first login. Admins can reset passwords for users within their scope.</p>
    `,
  },
  {
    id: "organizations",
    title: "Organizations",
    content: `
      <p>Organizations are the top-level grouping in Shifter. Each team belongs to an organization.</p>
      <ul>
        <li><strong>Create:</strong> Platform Admins can create new organizations from the Admin → Organizations page.</li>
        <li><strong>Members:</strong> Users are assigned to organizations with a role (admin or member).</li>
        <li><strong>Teams:</strong> Each team belongs to one organization. When creating a team, it's automatically assigned to the selected organization.</li>
        <li><strong>Delete:</strong> Deleting an organization removes all its teams, members, and data.</li>
      </ul>
    `,
  },
  {
    id: "teams",
    title: "Teams",
    content: `
      <p>A <strong>Team</strong> is a group of members who share a shift rotation. Each team belongs to an organization and has its own members, schedules, and settings.</p>
      <ul>
        <li><strong>Create:</strong> Click "Add Team" on the Dashboard.</li>
        <li><strong>Edit:</strong> Click the pencil icon on the team header to rename or change the description.</li>
        <li><strong>Delete:</strong> Deleting a team removes all its members, shifts, and settings.</li>
      </ul>
    `,
  },
  {
    id: "members",
    title: "Members",
    content: `
      <p>Members are the people assigned to shifts. Each member belongs to a team.</p>
      <h4>Member Properties</h4>
      <ul>
        <li><strong>Name:</strong> Must be unique within the team.</li>
        <li><strong>Sleeps in Building:</strong> Informational flag for your reference.</li>
        <li><strong>Leader:</strong> Leaders are excluded from auto-generated schedules but can cover shifts via swaps or manual assignment.</li>
        <li><strong>Shift Credit:</strong> Adjusts fairness for night shifts. Positive values count as extra shifts, negative as fewer. Useful when adding someone mid-rotation.</li>
        <li><strong>Day Shift Credit:</strong> Same as shift credit but for day shift rotation.</li>
        <li><strong>Shift Weight:</strong> Controls how many shifts a member receives relative to others. 1.0 = full load (default), 0.5 = half load, 2.0 = double load. Useful for part-time members or members transitioning in/out.</li>
      </ul>
      <h4>Adding a New Member</h4>
      <p>When you add a new member, their shift credit is automatically set to the current team minimum so they start on equal footing.</p>
    `,
  },
  {
    id: "availability",
    title: "Availability",
    content: `
      <p>Before generating a schedule, mark which dates each member is unavailable.</p>
      <ul>
        <li>Go to the team's <strong>Schedule</strong> page.</li>
        <li>Click the <strong>Availability</strong> button to open the panel.</li>
        <li>Click the <strong>+</strong> next to a member's name to add dates.</li>
        <li>You can click multiple dates at once and optionally add a reason.</li>
        <li>Remove an unavailability by hovering over the date tag and clicking <strong>×</strong>.</li>
      </ul>
    `,
  },
  {
    id: "leave-management",
    title: "Leave Management",
    content: `
      <p>Leave Management provides a formal workflow for vacation, sick, and personal leave requests. Approved leave automatically blocks scheduling — no manual unavailability marking needed.</p>
      <h4>Leave Types</h4>
      <ul>
        <li><strong>Vacation:</strong> Planned time off (holiday, travel, etc.).</li>
        <li><strong>Sick:</strong> Illness or medical leave.</li>
        <li><strong>Personal:</strong> Personal day or other reasons.</li>
      </ul>
      <h4>Submitting a Leave Request</h4>
      <ol>
        <li>Navigate to a team's <strong>Leave</strong> page (via the team header or the Leave button on the Team Detail page).</li>
        <li>Click <strong>New Request</strong>.</li>
        <li>Select the member, leave type, start date, and end date.</li>
        <li>For single-day requests, you can optionally choose <strong>Partial Day</strong> (morning or afternoon only).</li>
        <li>Add optional notes explaining the reason.</li>
        <li>Submit — the request starts in <strong>Pending</strong> status.</li>
      </ol>
      <h4>Approval Workflow</h4>
      <ul>
        <li>Pending requests appear in the <strong>"Awaiting Review"</strong> section on the Team Detail page for quick access.</li>
        <li><strong>Team Admins</strong> and above can <strong>approve</strong> or <strong>reject</strong> requests with optional review notes.</li>
        <li>Employees can only submit and cancel their own pending requests — they cannot approve or reject.</li>
        <li>When a request is <strong>approved</strong>, unavailability records are automatically created for each day in the date range, with the leave type recorded.</li>
        <li>When a request is <strong>rejected</strong>, no unavailabilities are created.</li>
      </ul>
      <h4>Cancelling & Revoking</h4>
      <ul>
        <li><strong>Cancel:</strong> Employees can cancel their own pending requests before they are reviewed.</li>
        <li><strong>Revoke:</strong> Admins can revoke an already-approved request, which automatically removes all associated unavailability records.</li>
      </ul>
      <h4>Calendar Integration</h4>
      <p>Approved leave shows up on the Schedule calendar with color-coded badges: <strong>blue</strong> for vacation, <strong>rose</strong> for sick, and <strong>orange</strong> for personal leave. The scheduling algorithm automatically avoids assigning shifts on leave days.</p>
      <h4>Filtering & Status</h4>
      <p>On the Leave page, use the status filter tabs (All, Pending, Approved, Rejected) to quickly find requests. Each tab shows a count badge so you can see how many requests are in each state at a glance.</p>
    `,
  },
  {
    id: "recurring-unavailability",
    title: "Recurring Unavailability",
    content: `
      <p>Recurring unavailability patterns let members define regular days they can't work — like a weekly class or a biweekly commitment — without manually marking each date every month.</p>
      <h4>Creating a Pattern</h4>
      <ol>
        <li>Open the <strong>Leave</strong> page for a team.</li>
        <li>Click <strong>Recurring Patterns</strong>.</li>
        <li>Select the member and choose the day of the week (Sunday through Saturday).</li>
        <li>Set the frequency: <strong>Weekly</strong> (every week) or <strong>Biweekly</strong> (every other week).</li>
        <li>Optionally add a reason (e.g., "University class").</li>
      </ol>
      <h4>Applying Patterns</h4>
      <p>Click <strong>Apply to Current Month</strong> to generate unavailability records for all matching dates in the current month. You can apply patterns each month before generating the schedule.</p>
      <h4>Managing Patterns</h4>
      <p>Patterns persist until you delete them. You can view all active patterns per member and remove any that are no longer relevant.</p>
    `,
  },
  {
    id: "schedule-generation",
    title: "Schedule Generation",
    content: `
      <p>The schedule generator assigns one member per night for the selected month, using a fairness algorithm.</p>
      <h4>How It Works</h4>
      <ol>
        <li>Fetches all members, their unavailabilities, and historical shift counts.</li>
        <li>For each day (Sun-Sat), finds eligible members who are available and under their shift-type cap.</li>
        <li>Sorts eligible members by <strong>total effective shifts</strong> (historical + credit + swap debt) to pick the member with the fewest.</li>
        <li>Applies minimum rest-gap rules between consecutive shifts.</li>
        <li>Pairs Friday-Saturday shifts to the same member.</li>
        <li>When no eligible member exists for a day, it creates a "No one available" slot with suggestions ranked by fairness.</li>
      </ol>
      <h4>Shift Type Caps</h4>
      <ul>
        <li><strong>Normal (Sun-Wed):</strong> Configurable max per month.</li>
        <li><strong>Thursday:</strong> Separate cap because Thursdays are often different.</li>
        <li><strong>Weekend (Fri-Sat):</strong> Separate cap, counted as one pair.</li>
      </ul>
      <h4>Re-Generating</h4>
      <p>You can regenerate a schedule at any time. It replaces existing future assignments for that month but preserves past ones (dates already passed).</p>
    `,
  },
  {
    id: "day-shifts",
    title: "Day Shifts",
    content: `
      <p>Day Shifts is a separate Sun-Thu weekly day-duty rotation. When enabled, the generator also assigns a day shift member for each work week.</p>
      <h4>How It Works</h4>
      <ul>
        <li>Each work week (Sun-Thu) is assigned to one member.</li>
        <li>Members are sorted by their total day shift count for fairness.</li>
        <li>If the chosen member is unavailable on specific days, the system flags those days for manual reassignment.</li>
        <li>Split-week support allows partial weeks at the start/end of months.</li>
      </ul>
      <h4>Day Shift History & Settlement</h4>
      <p>The day shift history panel (accessible in Reports or team settings) shows how many day shift days each member has done. You can <strong>Settle</strong> the day shift rotation, which resets all credits and sets a new baseline date — future fairness calculations only consider data after the settlement date.</p>
    `,
  },
  {
    id: "swaps",
    title: "Shift Swaps",
    content: `
      <p>Swaps let members trade shifts while tracking the debt.</p>
      <ul>
        <li>Click the swap icon on any shift in the calendar to initiate a swap.</li>
        <li>Select the <strong>covering member</strong> who will take the shift.</li>
        <li>The system records the original and covering member.</li>
        <li>Swap debt is factored into future fairness calculations: the covering member gets credit, the original member gets a penalty.</li>
        <li>You can <strong>revert</strong> a swap at any time.</li>
      </ul>
      <h4>Swap Balance</h4>
      <p>On the team page, each member shows their net swap balance. A positive number means they owe shifts (received more covers than they gave). This balance is factored into the scheduling algorithm.</p>
    `,
  },
  {
    id: "past-shifts",
    title: "Past Shifts",
    content: `
      <p>The Past Shifts page lets you view and manually add historical shift data.</p>
      <ul>
        <li>Navigate to any past month using the arrow buttons.</li>
        <li>Click <strong>Add Shifts</strong> to manually record shifts for a member by clicking on calendar dates.</li>
        <li>Click <strong>Add Day Shifts</strong> to record past day shift assignments.</li>
        <li>These historical records feed into the fairness algorithm for future schedule generation.</li>
      </ul>
    `,
  },
  {
    id: "settings",
    title: "Settings",
    content: `
      <p>Settings can be configured globally or per-team. Team-level settings override global defaults.</p>
      <h4>Shift Caps</h4>
      <ul>
        <li><strong>Max Normal Shifts:</strong> Max Sunday-Wednesday shifts per member per month.</li>
        <li><strong>Max Thursday Shifts:</strong> Max Thursday shifts per member per month.</li>
        <li><strong>Max Weekend Shifts:</strong> Max weekend (Fri-Sat pair) shifts per member per month.</li>
        <li><strong>Min Days Between Shifts:</strong> Minimum rest gap between consecutive shifts for the same member.</li>
        <li><strong>Min Shifts Per Month:</strong> Minimum number of shifts each member should receive. Members with limited availability are prioritized first.</li>
      </ul>
      <h4>Active Shift Days</h4>
      <ul>
        <li><strong>Active Days:</strong> Configure which days of the week are active for shift scheduling. Choose from presets (Full Week, Work Week Sun-Thu) or toggle individual days.</li>
        <li>Inactive days are completely skipped during schedule generation and appear muted in the calendar view.</li>
        <li>If only Friday or only Saturday is active (not both), the weekend pair logic degrades gracefully to a standalone shift.</li>
      </ul>
      <h4>Fairness & Algorithm</h4>
      <ul>
        <li><strong>Justice Lookback:</strong> How many months of history to consider for fairness. 0 = all time.</li>
        <li><strong>Fairness Mode:</strong> <em>Count</em> assigns based on total shift count (classic). <em>Ratio</em> accounts for each member's availability and weight — members available less often won't be overloaded.</li>
        <li><strong>Enable Rebalancing:</strong> When enabled, a second pass after initial scheduling swaps assignments between over- and under-loaded members to improve overall fairness spread.</li>
      </ul>
      <h4>Day Shifts</h4>
      <ul>
        <li><strong>Day Shift Enabled:</strong> Toggle the day shift rotation on/off.</li>
        <li><strong>Day Shift Settlement:</strong> (Team-level only) Reset the day shift fairness baseline. All credits are zeroed out and future generation only considers assignments after the settlement date.</li>
      </ul>
    `,
  },
  {
    id: "reports",
    title: "Reports",
    content: `
      <p>The Reports page shows a global overview of all teams with per-member statistics.</p>
      <ul>
        <li><strong>Shift Count:</strong> Total shifts assigned to each member.</li>
        <li><strong>Day Shifts:</strong> Total day shift days assigned.</li>
        <li><strong>Credit:</strong> Manual shift credit adjustments.</li>
        <li><strong>Swap Balance:</strong> Net swap debt (positive = owes shifts).</li>
        <li><strong>Distribution Bar:</strong> Visual comparison of shift load across team members.</li>
      </ul>
    `,
  },
  {
    id: "fairness",
    title: "Fairness Algorithm",
    content: `
      <p>Shifter uses a multi-factor fairness algorithm to distribute shifts equitably. The algorithm can be configured via Settings.</p>
      <h4>Effective Shift Count</h4>
      <p>For each member, the effective count is:</p>
      <p><code>effective = historical_shifts - covers_done + covers_received + shift_credit</code></p>
      <p>Members with the lowest effective count get priority.</p>
      <h4>Fairness Modes</h4>
      <ul>
        <li><strong>Count Mode (default):</strong> Classic mode — sorts by total effective shift count and shift-type count, with random tie-breaking.</li>
        <li><strong>Ratio Mode:</strong> Availability-weighted — computes a burden score: <code>(weighted_shifts / weight) / available_days</code>. Members available fewer days or with lower weight naturally receive fewer shifts without being overloaded. This solves the "availability concentration trap" where frequently-available members absorb a disproportionate share.</li>
      </ul>
      <h4>Shift Weight</h4>
      <p>Each member has a configurable weight (0.1 to 2.0, default 1.0). In ratio mode, <code>weight=0.5</code> means each shift counts double toward that member's burden, so they'll receive roughly half the shifts of a weight=1.0 member.</p>
      <h4>Minimum Participation</h4>
      <p>When <em>Min Shifts Per Month</em> is set above 0, a pre-pass runs before the main algorithm. It processes the most constrained members first (fewest available days) and pre-assigns them to available dates to meet the minimum floor.</p>
      <h4>Rebalancing Pass</h4>
      <p>When enabled, a second pass runs after initial scheduling. It iteratively finds the most-burdened and least-burdened members and attempts to swap their assignments to reduce the fairness spread. The pass runs up to 50 iterations or until the spread drops below 0.1.</p>
      <h4>Per-Type Balancing</h4>
      <p>The algorithm tracks normal, Thursday, and weekend shifts separately, so no one gets stuck with all the undesirable slots.</p>
      <h4>Lookback Window</h4>
      <p>Configure <em>Justice Lookback Months</em> to limit how far back the algorithm looks. This is useful to gradually "forget" old imbalances.</p>
    `,
  },
  {
    id: "random-picker",
    title: "Random Picker",
    content: `
      <p>The Random Picker is a utility for randomly selecting members from a team — useful for ad-hoc tasks, draws, or tie-breaking.</p>
      <ul>
        <li>Select a team, then toggle which members are in the pool.</li>
        <li>Choose how many to pick.</li>
        <li>Click <strong>Pick</strong> for a random selection.</li>
      </ul>
    `,
  },
  {
    id: "excel-export",
    title: "Excel Export",
    content: `
      <p>You can export any month's schedule to an Excel file (.xlsx).</p>
      <ul>
        <li>Go to the team's Schedule page.</li>
        <li>Click <strong>Export</strong> to download a spreadsheet with columns: Date, Day of Week, Member Name.</li>
        <li>The file is generated on the server using openpyxl and works with Excel, Google Sheets, and LibreOffice.</li>
      </ul>
    `,
  },
];

export default function DocsPage() {
  const [expandedId, setExpandedId] = useState<string | null>("overview");
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? sections.filter(
        (s) =>
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.content.toLowerCase().includes(search.toLowerCase()),
      )
    : sections;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
          <BookOpen size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Documentation</h2>
          <p className="text-sm text-gray-500">
            Learn how to use every feature of Shifter.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          placeholder="Search docs..."
        />
      </div>

      {/* TOC */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Table of Contents</h3>
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setExpandedId(s.id);
                document.getElementById(`doc-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {filtered.map((s) => {
          const open = expandedId === s.id;
          return (
            <div key={s.id} id={`doc-${s.id}`} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setExpandedId(open ? null : s.id)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                <span className="text-sm font-semibold text-gray-900">{s.title}</span>
              </button>
              {open && (
                <div
                  className="px-5 pb-4 prose prose-sm prose-gray max-w-none text-gray-700 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-gray-900 [&_h4]:mt-4 [&_h4]:mb-1 [&_ul]:ml-4 [&_ol]:ml-4 [&_li]:mb-1 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs"
                  dangerouslySetInnerHTML={{ __html: s.content }}
                />
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          No matching sections found.
        </div>
      )}
    </div>
  );
}
