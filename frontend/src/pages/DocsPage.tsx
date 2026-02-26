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
      <p><strong>Shifter</strong> is a fair, automated shift scheduling system for teams of any size. It handles night-shift rotation, weekend pairing, day-duty (Shotef) assignment, swap tracking, and fairness balancing — all through an intuitive web interface.</p>
      <p>Use this documentation to learn how to use every feature of Shifter.</p>
    `,
  },
  {
    id: "getting-started",
    title: "Getting Started",
    content: `
      <ol>
        <li><strong>Create a team</strong> from the Dashboard.</li>
        <li><strong>Add members</strong> — the people who will be assigned to shifts.</li>
        <li><strong>Mark unavailability</strong> — for each month, mark dates individual members can't work.</li>
        <li><strong>Generate</strong> the schedule for the month.</li>
        <li>Review results, <strong>swap</strong> shifts if needed, and <strong>export</strong> to Excel.</li>
      </ol>
    `,
  },
  {
    id: "teams",
    title: "Teams",
    content: `
      <p>A <strong>Team</strong> is a group of members who share a shift rotation. Each team has its own members, schedules, and settings.</p>
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
        <li><strong>Shotef Credit:</strong> Same as shift credit but for Shotef (day duty) rotation.</li>
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
    id: "shotef",
    title: "Shotef (Day Duty)",
    content: `
      <p>Shotef is a separate Sun-Thu weekly day-duty rotation. When enabled, the generator also assigns a Shotef member for each work week.</p>
      <h4>How It Works</h4>
      <ul>
        <li>Each work week (Sun-Thu) is assigned to one member.</li>
        <li>Members are sorted by their total Shotef day count for fairness.</li>
        <li>If the chosen member is unavailable on specific days, the system flags those days for manual reassignment.</li>
        <li>Split-week support allows partial weeks at the start/end of months.</li>
      </ul>
      <h4>Shotef History & Settlement</h4>
      <p>The Shotef history panel (accessible in Reports or team settings) shows how many Shotef days each member has done. You can <strong>Settle</strong> the Shotef rotation, which resets all credits and sets a new baseline date — future fairness calculations only consider data after the settlement date.</p>
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
        <li>Click <strong>Add Shotef</strong> to record past Shotef (day duty) assignments.</li>
        <li>These historical records feed into the fairness algorithm for future schedule generation.</li>
      </ul>
    `,
  },
  {
    id: "settings",
    title: "Settings",
    content: `
      <p>Settings can be configured globally or per-team. Team-level settings override global defaults.</p>
      <h4>Available Settings</h4>
      <ul>
        <li><strong>Max Normal Shifts:</strong> Max Sunday-Wednesday shifts per member per month.</li>
        <li><strong>Max Thursday Shifts:</strong> Max Thursday shifts per member per month.</li>
        <li><strong>Max Weekend Shifts:</strong> Max weekend (Fri-Sat pair) shifts per member per month.</li>
        <li><strong>Justice Lookback:</strong> How many months of history to consider for fairness. 0 = all time.</li>
        <li><strong>Min Days Between Shifts:</strong> Minimum rest gap between consecutive shifts for the same member.</li>
        <li><strong>Shotef Enabled:</strong> Toggle the Shotef (day duty) rotation on/off.</li>
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
        <li><strong>Shotef Days:</strong> Total Shotef (day duty) days assigned.</li>
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
      <p>Shifter uses a multi-factor fairness algorithm to distribute shifts equitably.</p>
      <h4>Effective Shift Count</h4>
      <p>For each member, the effective count is:</p>
      <p><code>effective = historical_shifts - covers_done + covers_received + shift_credit</code></p>
      <p>Members with the lowest effective count get priority.</p>
      <h4>Per-Type Balancing</h4>
      <p>The algorithm tracks normal, Thursday, and weekend shifts separately, so no one gets stuck with all the undesirable slots.</p>
      <h4>Tie-Breaking</h4>
      <p>When multiple members have the same effective count, the algorithm uses randomized tie-breaking to prevent patterns.</p>
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
