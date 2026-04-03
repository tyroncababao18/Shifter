import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Building2, Users, Layers, ArrowLeft, Shield, UserCog, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../contexts/AuthContext";
import { getOrganization, updateOrganization, removeOrgMember, updateOrgMember } from "../../api";
import type { OrganizationData, OrgMemberData, Team } from "../../api";

export default function OrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { isShifterAdmin, isOrgAdmin } = useAuth();
  const [org, setOrg] = useState<OrganizationData | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<OrgMemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState("");

  const id = parseInt(orgId || "0");
  const canAdmin = isShifterAdmin || isOrgAdmin(id);

  const load = () => {
    getOrganization(id)
      .then((res) => {
        setOrg(res.data.organization);
        setTeams(res.data.teams);
        setMembers(res.data.members);
        setNameVal(res.data.organization.name);
      })
      .catch(() => toast.error("Failed to load organization"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleRename = async () => {
    if (!nameVal.trim() || nameVal === org?.name) {
      setEditingName(false);
      return;
    }
    try {
      const res = await updateOrganization(id, nameVal.trim());
      setOrg(res.data);
      setEditingName(false);
      toast.success("Name updated");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to update");
    }
  };

  const handleRemoveMember = async (userId: number, email: string) => {
    if (!confirm(`Remove ${email} from this organization?`)) return;
    try {
      await removeOrgMember(id, userId);
      toast.success("Member removed");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to remove");
    }
  };

  const handleToggleRole = async (userId: number, currentRole: string) => {
    const newRole = currentRole === "organization_admin" ? "member" : "organization_admin";
    try {
      await updateOrgMember(id, userId, newRole);
      toast.success("Role updated");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to update role");
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;
  if (!org) return <div className="text-center py-12 text-gray-400">Organization not found</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/admin/organizations" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={14} /> Back to Organizations
      </Link>

      <div className="bg-white border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Building2 size={24} className="text-indigo-600" />
          </div>
          <div className="flex-1">
            {editingName ? (
              <div className="flex gap-2">
                <input
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  className="border rounded-lg px-3 py-1 text-lg font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  autoFocus
                  onBlur={handleRename}
                  onKeyDown={(e) => e.key === "Enter" && handleRename()}
                />
              </div>
            ) : (
              <h1
                className={`text-2xl font-bold text-gray-900 ${canAdmin ? "cursor-pointer hover:text-indigo-600" : ""}`}
                onClick={() => canAdmin && setEditingName(true)}
              >
                {org.name}
              </h1>
            )}
            <p className="text-sm text-gray-500">Created {org.created_at ? new Date(org.created_at).toLocaleDateString() : "—"}</p>
          </div>
        </div>
      </div>

      {/* Teams */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Layers size={18} /> Teams ({teams.length})
        </h2>
        {teams.length === 0 ? (
          <p className="text-sm text-gray-400">No teams in this organization</p>
        ) : (
          <div className="grid gap-2">
            {teams.map((t) => (
              <Link
                key={t.id}
                to={`/teams/${t.id}`}
                className="bg-white border rounded-lg p-3 hover:border-indigo-300 transition-colors text-sm flex items-center justify-between"
              >
                <span className="font-medium text-gray-800">{t.name}</span>
                <span className="text-xs text-gray-400">{t.member_count} members</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Members */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Users size={18} /> Members ({members.length})
        </h2>
        {members.length === 0 ? (
          <p className="text-sm text-gray-400">No members</p>
        ) : (
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">User</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Role</th>
                  {canAdmin && <th className="text-right px-4 py-2.5 font-medium text-gray-500">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {[m.first_name, m.last_name].filter(Boolean).join(" ") || "—"}
                      </div>
                      <div className="text-xs text-gray-400">{m.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        m.org_role === "organization_admin"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {m.org_role === "organization_admin" ? <><Shield size={10} /> Org Admin</> : "Member"}
                      </span>
                    </td>
                    {canAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleToggleRole(m.id, m.org_role)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 mr-3"
                          title="Toggle role"
                        >
                          <UserCog size={14} />
                        </button>
                        <button
                          onClick={() => handleRemoveMember(m.id, m.email)}
                          className="text-xs text-red-500 hover:text-red-700"
                          title="Remove from org"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
