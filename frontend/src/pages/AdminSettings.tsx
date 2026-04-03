import { useEffect, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Save, RotateCcw, Settings, ShieldCheck, CalendarDays, Scale, Timer, Sun } from "lucide-react";
import { getSettings, updateSettings, getTeams, settleDayShifts, type SettingsMap, type Team } from "../api";
import { useAuth } from "../contexts/AuthContext";
import ConfirmDialog from "../components/ConfirmDialog";

interface SettingField {
  key: keyof SettingsMap;
  label: string;
  description: string;
  hint?: string;
  min: number;
  max: number;
}

const SHIFT_LIMIT_FIELDS: SettingField[] = [
  {
    key: "max_normal_shifts",
    label: "Weekday shifts (Sun–Wed)",
    description: "Maximum per member per month.",
    hint: "Most members hit this cap first.",
    min: 1,
    max: 30,
  },
  {
    key: "max_thursday_shifts",
    label: "Thursday shifts",
    description: "Maximum per member per month.",
    min: 1,
    max: 5,
  },
  {
    key: "max_weekend_shifts",
    label: "Weekend shifts (Fri–Sat pair)",
    description: "Maximum per member per month.",
    min: 1,
    max: 5,
  },
  {
    key: "min_shifts_per_month",
    label: "Minimum shifts per month",
    description: "Minimum shifts each member should receive. Members with limited availability are prioritized.",
    hint: "Set to 0 to disable.",
    min: 0,
    max: 10,
  },
];

const CONSTRAINT_FIELDS: SettingField[] = [
  {
    key: "min_days_between_shifts",
    label: "Rest days between shifts",
    description: "Minimum gap between consecutive shifts for the same member.",
    hint: "1 = no back-to-back shifts.",
    min: 0,
    max: 7,
  },
];

const FAIRNESS_FIELDS: SettingField[] = [
  {
    key: "justice_lookback_months",
    label: "Lookback window",
    description: "How many months of history to consider when balancing shifts.",
    hint: "0 = all-time history.",
    min: 0,
    max: 120,
  },
];

/* ────── Reusable section wrapper ────── */
function Section({ icon, title, description, children }: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="text-indigo-600">{icon}</span>
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{title}</h3>
      </div>
      <p className="text-xs text-gray-500 mb-3 ml-[26px]">{description}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/* ────── Numeric field row (compact) ────── */
function NumberRow({ field, value, defaultValue, onChange }: {
  field: SettingField;
  value: string;
  defaultValue?: string;
  onChange: (v: string) => void;
}) {
  const changed = defaultValue !== undefined && value !== defaultValue;
  return (
    <div className="flex items-start gap-4 bg-white rounded-xl border border-gray-200 px-4 py-3">
      <div className="flex-1 min-w-0">
        <label className="text-sm font-medium text-gray-900">{field.label}</label>
        <p className="text-xs text-gray-500 mt-0.5">{field.description}</p>
        {field.hint && <p className="text-xs text-gray-400 italic">{field.hint}</p>}
        {changed && <p className="text-xs text-indigo-600 mt-0.5">Default: {defaultValue}</p>}
      </div>
      <input
        type="number"
        min={field.min}
        max={field.max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shrink-0"
      />
    </div>
  );
}

/* ────── Toggle row ────── */
function ToggleRow({ label, description, checked, onChange, color = "indigo", defaultValue, children }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  color?: "indigo" | "teal";
  defaultValue?: string;
  children?: ReactNode;
}) {
  const bg = color === "teal" ? "bg-teal-600" : "bg-indigo-600";
  const changed = defaultValue !== undefined && String(checked) !== defaultValue;
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <label className="text-sm font-medium text-gray-900">{label}</label>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          {changed && <p className="text-xs text-indigo-600 mt-0.5">Default: {defaultValue}</p>}
        </div>
        <button
          type="button"
          onClick={onChange}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
            checked ? bg : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              checked ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {children}
    </div>
  );
}

/* ────── Main component ────── */
export default function AdminSettings() {
  const { selectedOrgId } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<number | "global">("global");
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [defaults, setDefaults] = useState<SettingsMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [settling, setSettling] = useState(false);

  const load = async () => {
    try {
      const [teamsRes, settingsRes] = await Promise.all([
        getTeams(selectedOrgId),
        getSettings(selectedTeam === "global" ? undefined : selectedTeam),
      ]);
      setTeams(teamsRes.data.teams);
      setSettings(settingsRes.data.settings);
      setDefaults(settingsRes.data.defaults);
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); load(); }, [selectedTeam, selectedOrgId]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const teamId = selectedTeam === "global" ? undefined : selectedTeam;
      const { data } = await updateSettings(settings, teamId);
      setSettings(data.settings);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (defaults) {
      setSettings({ ...defaults });
      toast.success("Reset to defaults");
    }
  };

  const handleSettle = async () => {
    if (selectedTeam === "global") return;
    setSettling(true);
    try {
      const { data } = await settleDayShifts(selectedTeam);
      toast.success(data.message);
      setShowSettle(false);
      load();
    } catch {
      toast.error("Failed to settle");
    } finally {
      setSettling(false);
    }
  };

  const set = (key: keyof SettingsMap, value: string) =>
    settings && setSettings({ ...settings, [key]: value });

  if (loading) {
    return <div className="max-w-2xl space-y-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  }

  return (
    <div className="max-w-2xl">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
          <Settings size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Settings</h2>
          <p className="text-sm text-gray-500">Configure scheduling rules and constraints.</p>
        </div>
      </div>

      {/* ── Scope selector ── */}
      <div className="mb-8 bg-white rounded-xl border border-gray-200 px-4 py-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">Configuration scope</label>
        <select
          value={selectedTeam}
          onChange={(e) => setSelectedTeam(e.target.value === "global" ? "global" : Number(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        >
          <option value="global">Global (all teams)</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name} (team override)</option>)}
        </select>
        <p className="text-xs text-gray-500 mt-1.5">
          {selectedTeam === "global"
            ? "These values apply to every team unless a team-specific override exists."
            : "These overrides apply only to this team and take priority over global settings."}
        </p>
      </div>

      {settings && (
        <>
          {/* ── 1. Shift limits ── */}
          <Section
            icon={<CalendarDays size={16} />}
            title="Shift Limits"
            description="Control how many shifts a single member can be assigned per month."
          >
            {SHIFT_LIMIT_FIELDS.map((f) => (
              <NumberRow
                key={f.key}
                field={f}
                value={settings[f.key]}
                defaultValue={defaults?.[f.key]}
                onChange={(v) => set(f.key, v)}
              />
            ))}
          </Section>

          {/* ── 2. Scheduling constraints ── */}
          <Section
            icon={<Timer size={16} />}
            title="Scheduling Constraints"
            description="Rules that govern when and how shifts are assigned."
          >
            {CONSTRAINT_FIELDS.map((f) => (
              <NumberRow
                key={f.key}
                field={f}
                value={settings[f.key]}
                defaultValue={defaults?.[f.key]}
                onChange={(v) => set(f.key, v)}
              />
            ))}

            {/* Active Shift Days */}
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <label className="text-sm font-medium text-gray-900 mb-2 block">Active shift days</label>
              <p className="text-xs text-gray-500 mb-2">Only these days will have shifts generated. Inactive days are skipped entirely.</p>
              <div className="flex gap-2 mb-3">
                {([
                  { label: "Full Week", days: "0,1,2,3,4,5,6" },
                  { label: "Work Week (Sun–Thu)", days: "6,0,1,2,3" },
                ] as const).map((preset) => {
                  const current = new Set((settings.active_days || "0,1,2,3,4,5,6").split(",").map(Number));
                  const presetSet = new Set(preset.days.split(",").map(Number));
                  const isActive = current.size === presetSet.size && [...current].every((d) => presetSet.has(d));
                  return (
                    <button
                      key={preset.label}
                      onClick={() => set("active_days", preset.days)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        isActive
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1.5">
                {(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const).map((dayLabel, idx) => {
                  const weekday = [6, 0, 1, 2, 3, 4, 5][idx];
                  const current = new Set((settings.active_days || "0,1,2,3,4,5,6").split(",").map(Number));
                  const isOn = current.has(weekday);
                  return (
                    <button
                      key={dayLabel}
                      onClick={() => {
                        const next = new Set(current);
                        if (isOn) next.delete(weekday);
                        else next.add(weekday);
                        set("active_days", [...next].join(","));
                      }}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                        isOn
                          ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                          : "bg-gray-50 text-gray-400 border-gray-200"
                      }`}
                    >
                      {dayLabel}
                    </button>
                  );
                })}
              </div>
              {defaults && settings.active_days !== defaults.active_days && (
                <p className="text-xs text-indigo-600 mt-2">Default: {defaults.active_days}</p>
              )}
            </div>
          </Section>

          {/* ── 3. Fairness & balancing ── */}
          <Section
            icon={<Scale size={16} />}
            title="Fairness & Balancing"
            description="How the scheduler distributes shifts evenly across members."
          >
            {/* Fairness Mode */}
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <label className="text-sm font-medium text-gray-900">Fairness mode</label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <strong>Count</strong> balances by total shift count.
                    <strong> Ratio</strong> accounts for each member's availability so less-available members aren't overloaded.
                  </p>
                  {defaults && settings.fairness_mode !== defaults.fairness_mode && (
                    <p className="text-xs text-indigo-600 mt-0.5">Default: {defaults.fairness_mode}</p>
                  )}
                </div>
                <select
                  value={settings.fairness_mode}
                  onChange={(e) => set("fairness_mode", e.target.value)}
                  className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shrink-0"
                >
                  <option value="count">Count</option>
                  <option value="ratio">Ratio</option>
                </select>
              </div>
            </div>

            {FAIRNESS_FIELDS.map((f) => (
              <NumberRow
                key={f.key}
                field={f}
                value={settings[f.key]}
                defaultValue={defaults?.[f.key]}
                onChange={(v) => set(f.key, v)}
              />
            ))}

            <ToggleRow
              label="Rebalancing pass"
              description="After initial scheduling, attempt to swap assignments between over- and under-loaded members to improve fairness."
              checked={settings.enable_rebalancing === "true"}
              onChange={() => set("enable_rebalancing", settings.enable_rebalancing === "true" ? "false" : "true")}
              defaultValue={defaults?.enable_rebalancing}
            />
          </Section>

          {/* ── 4. Day shift rotation ── */}
          <Section
            icon={<Sun size={16} />}
            title="Day Shift Rotation"
            description="Assign a rotating day shift member each work week."
          >
            <ToggleRow
              label="Enable day shift rotation"
              description="When enabled, schedule generation also assigns a day shift member for each work week (Sun–Thu). Leaders are excluded."
              checked={settings.shotef_enabled === "true"}
              onChange={() => set("shotef_enabled", settings.shotef_enabled === "true" ? "false" : "true")}
              color="teal"
              defaultValue={defaults?.shotef_enabled}
            />

            {selectedTeam !== "global" && (
              <div className="bg-white rounded-xl border border-teal-200 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <label className="text-sm font-medium text-gray-900">Settle day shift fairness</label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Resets the fairness baseline to today. All day shift credits are zeroed out and future scheduling only considers assignments after the settlement date.
                    </p>
                    {settings.shotef_settled_at && (
                      <p className="text-xs text-teal-600 mt-1 font-medium">
                        Last settled: {settings.shotef_settled_at}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setShowSettle(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 shrink-0"
                  >
                    <ShieldCheck size={14} />
                    Settle Now
                  </button>
                </div>
              </div>
            )}
          </Section>
        </>
      )}

      {/* ── Actions ── */}
      <div className="flex gap-3 mt-2 mb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Save size={14} /> {saving ? "Saving..." : "Save Settings"}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          <RotateCcw size={14} /> Reset to Defaults
        </button>
      </div>

      <ConfirmDialog
        open={showSettle}
        title="Settle Day Shift Fairness"
        message="This will reset the day shift fairness baseline to today, zero out all day shift credits, and future auto-generation will only consider assignments after today. This cannot be undone."
        confirmLabel={settling ? "Settling..." : "Settle"}
        onConfirm={handleSettle}
        onClose={() => setShowSettle(false)}
      />
    </div>
  );
}
