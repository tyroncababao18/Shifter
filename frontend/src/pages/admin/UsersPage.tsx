import { useEffect, useState } from "react";
import { Plus, Trash2, KeyRound, Shield } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../contexts/AuthContext";
import { getUsers, createUser, deleteUser, resetUserPassword, getOrganizations } from "../../api";
import type { AuthUser, OrganizationData } from "../../api";

export default function UsersPage() {
  const { isShifterAdmin, user: currentUser } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [orgs, setOrgs] = useState<OrganizationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPw, setResetPw] = useState("");

  // Create user form
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formFirst, setFormFirst] = useState("");
  const [formLast, setFormLast] = useState("");
  const [formPlatformRole, setFormPlatformRole] = useState("none");
  const [formOrgId, setFormOrgId] = useState<number | "">("");
  const [formOrgRole, setFormOrgRole] = useState("member");

  const load = () => {
    Promise.all([getUsers(), getOrganizations()])
      .then(([uRes, oRes]) => {
        setUsers(uRes.data.users);
        setOrgs(oRes.data.organizations);
      })
      .catch(() => toast.error("Failed to load data"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser({
        email: formEmail,
        password: formPassword,
        first_name: formFirst,
        last_name: formLast,
        platform_role: formPlatformRole,
        organization_id: formOrgId || undefined,
        org_role: formOrgRole,
        must_change_password: true,
      });
      toast.success("User created");
      setShowCreate(false);
      setFormEmail(""); setFormPassword(""); setFormFirst(""); setFormLast("");
      setFormPlatformRole("none"); setFormOrgId(""); setFormOrgRole("member");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to create user");
    }
  };

  const handleDelete = async (id: number, email: string) => {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
      await deleteUser(id);
      toast.success("User deleted");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to delete");
    }
  };

  const handleResetPassword = async () => {
    if (!resetUserId || resetPw.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    try {
      await resetUserPassword(resetUserId, resetPw);
      toast.success("Password reset");
      setResetUserId(null);
      setResetPw("");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to reset password");
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">{users.length} users</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          <Plus size={16} /> New User
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border rounded-xl p-5 mb-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Create User</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
              <input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Password *</label>
              <input value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required type="password"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">First Name</label>
              <input value={formFirst} onChange={(e) => setFormFirst(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Last Name</label>
              <input value={formLast} onChange={(e) => setFormLast(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            {isShifterAdmin && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Platform Role</label>
                <select value={formPlatformRole} onChange={(e) => setFormPlatformRole(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="none">None</option>
                  <option value="shifter_admin">Shifter Admin</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Organization</label>
              <select value={formOrgId} onChange={(e) => setFormOrgId(e.target.value ? parseInt(e.target.value) : "")}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">None</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            {formOrgId && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Org Role</label>
                <select value={formOrgRole} onChange={(e) => setFormOrgRole(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="member">Member</option>
                  <option value="organization_admin">Organization Admin</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
              Create User
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-gray-700 text-sm px-4 py-2">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Password reset modal */}
      {resetUserId && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-5 w-96">
            <h3 className="font-semibold mb-3">Reset Password</h3>
            <input
              type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)}
              placeholder="New password (min 6 chars)"
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-indigo-500 outline-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={handleResetPassword} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
                Reset
              </button>
              <button onClick={() => { setResetUserId(null); setResetPw(""); }} className="text-gray-500 hover:text-gray-700 text-sm px-4 py-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">User</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Role</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Status</th>
              <th className="text-right px-4 py-2.5 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">
                    {[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}
                  </div>
                  <div className="text-xs text-gray-400">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  {u.platform_role === "shifter_admin" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      <Shield size={10} /> Platform Admin
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">User</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${u.is_active ? "text-green-600" : "text-red-500"}`}>
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                  {u.must_change_password && (
                    <span className="ml-2 text-xs text-amber-600">Needs password change</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() => setResetUserId(u.id)}
                    className="text-gray-400 hover:text-indigo-600"
                    title="Reset password"
                  >
                    <KeyRound size={14} />
                  </button>
                  {u.id !== currentUser?.id && (
                    <button
                      onClick={() => handleDelete(u.id, u.email)}
                      className="text-gray-400 hover:text-red-500"
                      title="Delete user"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
