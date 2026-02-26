import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Users, CalendarClock, CalendarDays, Trash2 } from "lucide-react";
import { getTeams, createTeam, deleteTeam, type Team } from "../api";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";

export default function Dashboard() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [stats, setStats] = useState({ total_teams: 0, total_members: 0, total_shifts: 0 });
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await getTeams();
      setTeams(data.teams);
      setStats(data.stats);
    } catch {
      toast.error("Failed to load teams");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Team name is required"); return; }
    try {
      await createTeam({ name: name.trim(), description: desc.trim() });
      toast.success("Team created");
      setShowAdd(false);
      setName("");
      setDesc("");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to create team");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTeam(deleteTarget.id);
      toast.success("Team deleted");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Failed to delete team");
    }
  };

  const statCards = [
    { label: "Teams", value: stats.total_teams, icon: Users, color: "bg-indigo-50 text-indigo-600" },
    { label: "Members", value: stats.total_members, icon: CalendarClock, color: "bg-emerald-50 text-emerald-600" },
    { label: "Shifts", value: stats.total_shifts, icon: CalendarDays, color: "bg-amber-50 text-amber-600" },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
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

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-semibold text-gray-900">Teams</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} /> Add Team
        </button>
      </div>

      {/* Team cards */}
      {teams.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Users size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No teams yet. Create your first team to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow group relative">
              <Link to={`/teams/${t.id}`} className="block p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-semibold text-sm">
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{t.name}</h3>
                    <p className="text-xs text-gray-500">{t.member_count} member{t.member_count !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                {t.description && (
                  <p className="text-sm text-gray-500 line-clamp-2">{t.description}</p>
                )}
              </Link>
              <button
                onClick={(e) => { e.preventDefault(); setDeleteTarget(t); }}
                className="absolute top-3 right-3 p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Team Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Team">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="e.g. Alpha Squad"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
              rows={3}
              placeholder="Optional description..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Create Team
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Team"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This will also delete all members and shifts.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
