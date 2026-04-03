import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Plus, Trash2, Users, Layers } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../contexts/AuthContext";
import { getOrganizations, createOrganization, deleteOrganization } from "../../api";
import type { OrganizationData } from "../../api";

export default function OrganizationsPage() {
  const { isShifterAdmin } = useAuth();
  const [orgs, setOrgs] = useState<OrganizationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const load = () => {
    getOrganizations()
      .then((res) => setOrgs(res.data.organizations))
      .catch(() => toast.error("Failed to load organizations"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createOrganization(newName.trim());
      setNewName("");
      setShowCreate(false);
      toast.success("Organization created");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to create");
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}" and all its teams? This cannot be undone.`)) return;
    try {
      await deleteOrganization(id);
      toast.success("Organization deleted");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to delete");
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
          <p className="text-sm text-gray-500 mt-1">Manage platform organizations</p>
        </div>
        {isShifterAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            <Plus size={16} /> New Organization
          </button>
        )}
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border rounded-xl p-4 mb-6 flex gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Organization name"
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            autoFocus
          />
          <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
            Create
          </button>
          <button type="button" onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-gray-700 text-sm">
            Cancel
          </button>
        </form>
      )}

      {orgs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Building2 size={48} className="mx-auto mb-3 opacity-30" />
          <p>No organizations yet</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {orgs.map((org) => (
            <Link
              key={org.id}
              to={`/admin/organizations/${org.id}`}
              className="bg-white border rounded-xl p-5 hover:border-indigo-300 hover:shadow-sm transition-all flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <Building2 size={22} className="text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{org.name}</h3>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Users size={12} /> {org.member_count ?? 0} members</span>
                    <span className="flex items-center gap-1"><Layers size={12} /> {org.team_count ?? 0} teams</span>
                  </div>
                </div>
              </div>
              {isShifterAdmin && (
                <button
                  onClick={(e) => { e.preventDefault(); handleDelete(org.id, org.name); }}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
