import { useEffect, useState, useCallback } from "react";
import { Dices, RotateCcw, Check } from "lucide-react";
import { getTeams, getMembers, type Team, type Member } from "../api";

export default function PickerPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pickCount, setPickCount] = useState(1);
  const [results, setResults] = useState<Member[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    getTeams().then((r) => setTeams(r.data.teams));
  }, []);

  useEffect(() => {
    if (!selectedTeamId) { setMembers([]); setSelected(new Set()); setResults([]); return; }
    setLoadingMembers(true);
    getMembers(selectedTeamId).then((r) => {
      setMembers(r.data.members);
      setSelected(new Set(r.data.members.map((m) => m.id)));
      setResults([]);
      setPickCount(1);
    }).finally(() => setLoadingMembers(false));
  }, [selectedTeamId]);

  const toggleMember = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setResults([]);
  };

  const selectAll = () => { setSelected(new Set(members.map((m) => m.id))); setResults([]); };
  const selectNone = () => { setSelected(new Set()); setResults([]); };

  const pool = members.filter((m) => selected.has(m.id));
  const maxPick = pool.length;

  const doPick = useCallback(() => {
    if (pool.length === 0 || pickCount < 1) return;
    setSpinning(true);
    setResults([]);

    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, Math.min(pickCount, pool.length));

    setTimeout(() => {
      setResults(picked);
      setSpinning(false);
    }, 600);
  }, [pool, pickCount]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
          <Dices size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Random Picker</h2>
          <p className="text-sm text-gray-500">Randomly select members from a team</p>
        </div>
      </div>

      {/* Team selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
        <select
          value={selectedTeamId ?? ""}
          onChange={(e) => setSelectedTeamId(e.target.value ? Number(e.target.value) : null)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
        >
          <option value="">Select a team...</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {loadingMembers && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      )}

      {!loadingMembers && selectedTeamId && members.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">This team has no members.</p>
        </div>
      )}

      {!loadingMembers && members.length > 0 && (
        <>
          {/* Member chips */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">Members ({selected.size}/{members.length} selected)</label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-violet-600 hover:text-violet-800 font-medium">All</button>
                <span className="text-gray-300">|</span>
                <button onClick={selectNone} className="text-xs text-violet-600 hover:text-violet-800 font-medium">None</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const active = selected.has(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMember(m.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      active
                        ? "bg-violet-100 text-violet-700 ring-1 ring-violet-300"
                        : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                    }`}
                  >
                    {active && <Check size={12} />}
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pick controls */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <div className="flex items-end gap-4 flex-wrap">
              <div className="flex-1 min-w-[120px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">How many to pick</label>
                <input
                  type="number"
                  min={1}
                  max={maxPick || 1}
                  value={pickCount}
                  onChange={(e) => setPickCount(Math.max(1, Math.min(maxPick || 1, Number(e.target.value))))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                />
              </div>
              <button
                onClick={doPick}
                disabled={pool.length === 0 || spinning}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                <Dices size={16} className={spinning ? "animate-spin" : ""} />
                {spinning ? "Picking..." : "Pick"}
              </button>
              {results.length > 0 && (
                <button
                  onClick={doPick}
                  disabled={spinning}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RotateCcw size={14} /> Again
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Result</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {results.map((m, i) => (
                  <div
                    key={m.id}
                    className="bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl p-5 text-white shadow-lg animate-[fadeIn_0.4s_ease-out]"
                    style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-lg">{m.name}</p>
                        <p className="text-white/70 text-xs">{m.shift_count} shift{m.shift_count !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
