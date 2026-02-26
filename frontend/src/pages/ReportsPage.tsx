import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Users, CalendarClock, CalendarDays, BarChart3 } from "lucide-react";
import { getReports, type ReportTeam } from "../api";

export default function ReportsPage() {
  const [teams, setTeams] = useState<ReportTeam[]>([]);
  const [stats, setStats] = useState({ total_teams: 0, total_members: 0, total_shifts: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getReports();
        setTeams(data.teams);
        setStats(data.stats);
      } catch {
        toast.error("Failed to load reports");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  }

  const statCards = [
    { label: "Teams", value: stats.total_teams, icon: Users, color: "bg-indigo-50 text-indigo-600" },
    { label: "Members", value: stats.total_members, icon: CalendarClock, color: "bg-emerald-50 text-emerald-600" },
    { label: "Total Shifts", value: stats.total_shifts, icon: CalendarDays, color: "bg-amber-50 text-amber-600" },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
          <BarChart3 size={20} />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Reports</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${s.color}`}>
              <s.icon size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-sm text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Team breakdowns */}
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Breakdown</h3>
      {teams.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">No data yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {teams.map((t) => (
            <div key={t.team_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-gray-900">{t.team_name}</h4>
                  <p className="text-xs text-gray-500">
                    {t.member_count} member{t.member_count !== 1 ? "s" : ""} · {t.total_shifts} total shift{t.total_shifts !== 1 ? "s" : ""}
                  </p>
                </div>
                {t.member_count > 0 && (
                  <span className="text-xs text-gray-500">
                    Avg: {(t.total_shifts / t.member_count).toFixed(1)} shifts/member
                  </span>
                )}
              </div>

              {t.members.length > 0 && (
                <div className="px-5 py-3">
                  <table className="w-full">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-100">
                        <th className="text-left py-2 font-medium">Member</th>
                        <th className="text-right py-2 font-medium">Shifts</th>
                        <th className="text-right py-2 font-medium">Shotef</th>
                        <th className="text-right py-2 font-medium">Credit</th>
                        <th className="text-right py-2 font-medium" title="Positive = owes shifts, Negative = is owed shifts">Swap Bal.</th>
                        <th className="text-right py-2 font-medium w-1/4">Distribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.members
                        .sort((a, b) => b.shift_count - a.shift_count)
                        .map((m) => {
                          const maxShifts = Math.max(...t.members.map((mm) => mm.shift_count), 1);
                          const pct = (m.shift_count / maxShifts) * 100;
                          return (
                            <tr key={m.id} className="border-b border-gray-50 last:border-0">
                              <td className="py-2 text-sm text-gray-900">{m.name}</td>
                              <td className="py-2 text-sm text-gray-700 text-right font-medium">{m.shift_count}</td>
                              <td className="py-2 text-sm text-right">
                                <span className="text-teal-700 font-medium">{m.shotef_days ?? 0}</span>
                              </td>
                              <td className="py-2 text-sm text-right">
                                {m.shift_credit !== 0 ? (
                                  <span className="text-purple-600 font-medium">
                                    {m.shift_credit > 0 ? "+" : ""}{m.shift_credit}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">0</span>
                                )}
                              </td>
                              <td className="py-2 text-sm text-right">
                                {m.swap_balance !== 0 ? (
                                  <span className={`font-medium ${m.swap_balance > 0 ? "text-red-600" : "text-green-600"}`}>
                                    {m.swap_balance > 0 ? "+" : ""}{m.swap_balance}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">0</span>
                                )}
                              </td>
                              <td className="py-2">
                                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                  <div
                                    className="h-full bg-indigo-500 rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
