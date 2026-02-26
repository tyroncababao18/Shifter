import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Save, RotateCcw, Settings, ShieldCheck } from "lucide-react";
import { getSettings, updateSettings, getTeams, settleShotef, type SettingsMap, type Team } from "../api";
import ConfirmDialog from "../components/ConfirmDialog";

interface SettingField {
  key: keyof SettingsMap;
  label: string;
  description: string;
  min: number;
  max: number;
}

const FIELDS: SettingField[] = [
  {
    key: "max_normal_shifts",
    label: "Max Normal Shifts (Sun-Wed)",
    description: "Maximum number of Sunday through Wednesday shifts a member can have per month.",
    min: 1,
    max: 30,
  },
  {
    key: "max_thursday_shifts",
    label: "Max Thursday Shifts",
    description: "Maximum number of Thursday shifts a member can have per month.",
    min: 1,
    max: 5,
  },
  {
    key: "max_weekend_shifts",
    label: "Max Weekend Shifts (Fri-Sat)",
    description: "Maximum number of weekend (Friday-Saturday pair) shifts a member can have per month.",
    min: 1,
    max: 5,
  },
  {
    key: "justice_lookback_months",
    label: "Justice Lookback (months)",
    description: "How many months back to consider when calculating fairness. 0 means all-time.",
    min: 0,
    max: 120,
  },
  {
    key: "min_days_between_shifts",
    label: "Min Days Between Shifts",
    description: "Minimum number of days between consecutive shifts for the same member. 1 means no back-to-back shifts.",
    min: 0,
    max: 7,
  },
];

export default function AdminSettings() {
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
        getTeams(),
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

  useEffect(() => { setLoading(true); load(); }, [selectedTeam]);

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
      const { data } = await settleShotef(selectedTeam);
      toast.success(data.message);
      setShowSettle(false);
      load();
    } catch {
      toast.error("Failed to settle");
    } finally {
      setSettling(false);
    }
  };

  if (loading) {
    return <div className="max-w-2xl space-y-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
          <Settings size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Settings</h2>
          <p className="text-sm text-gray-500">Configure scheduling rules and constraints.</p>
        </div>
      </div>

      {/* Scope selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
        <select
          value={selectedTeam}
          onChange={(e) => setSelectedTeam(e.target.value === "global" ? "global" : Number(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        >
          <option value="global">Global (all teams)</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name} (team override)</option>)}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          Team-specific settings override global defaults.
        </p>
      </div>

      {/* Settings fields */}
      {settings && (
        <div className="space-y-4">
          {FIELDS.map((f) => (
            <div key={f.key} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-semibold text-gray-900">{f.label}</label>
                <input
                  type="number"
                  min={f.min}
                  max={f.max}
                  value={settings[f.key]}
                  onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
                  className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <p className="text-xs text-gray-500">{f.description}</p>
              {defaults && settings[f.key] !== defaults[f.key] && (
                <p className="text-xs text-indigo-600 mt-1">Default: {defaults[f.key]}</p>
              )}
            </div>
          ))}

          {/* Shotef toggle */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-gray-900">Enable Shotef (Day Duty) Rotation</label>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, shotef_enabled: settings.shotef_enabled === "true" ? "false" : "true" })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.shotef_enabled === "true" ? "bg-teal-600" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.shotef_enabled === "true" ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              When enabled, schedule generation also assigns a Shotef (day duty) member for each work week (Sun-Thu). Leaders are excluded.
            </p>
            {defaults && settings.shotef_enabled !== defaults.shotef_enabled && (
              <p className="text-xs text-indigo-600 mt-1">Default: {defaults.shotef_enabled}</p>
            )}
          </div>

          {/* Settle Shotef */}
          {selectedTeam !== "global" && (
            <div className="bg-white rounded-xl border border-teal-200 p-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-semibold text-gray-900">Settle Shotef Fairness</label>
                <button
                  onClick={() => setShowSettle(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                >
                  <ShieldCheck size={14} />
                  Settle Now
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Settling resets the shotef fairness baseline to today. All shotef credits are zeroed out and future auto-generation only considers assignments after the settlement date. Use this when you want to start fresh.
              </p>
              {settings.shotef_settled_at && (
                <p className="text-xs text-teal-600 mt-1 font-medium">
                  Last settled: {settings.shotef_settled_at}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-6">
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
        title="Settle Shotef Fairness"
        message="This will reset the shotef fairness baseline to today, zero out all shotef credits, and future auto-generation will only consider assignments after today. This cannot be undone."
        confirmLabel={settling ? "Settling..." : "Settle"}
        onConfirm={handleSettle}
        onClose={() => setShowSettle(false)}
      />
    </div>
  );
}
