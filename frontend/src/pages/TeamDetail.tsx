import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import {
  Plus, Trash2, Edit3, Calendar, Clock, ChevronLeft, Pencil, CalendarOff,
  Palmtree, Thermometer, User, Check, X, ArrowRight,
} from "lucide-react";
import {
  getTeam, createMember, updateMember, deleteMember, deleteTeam, updateTeam,
  getSwapBalance, getLeaveRequests, approveLeaveRequest, rejectLeaveRequest,
  type Team, type Member, type SwapBalance, type LeaveRequest, type LeaveType,
} from "../api";
import { useAuth } from "../contexts/AuthContext";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";

const LEAVE_ICONS: Record<LeaveType, typeof Palmtree> = { vacation: Palmtree, sick: Thermometer, personal: User };
const LEAVE_COLORS: Record<LeaveType, { bg: string; text: string }> = {
  vacation: { bg: "bg-blue-100", text: "text-blue-700" },
  sick: { bg: "bg-red-100", text: "text-red-700" },
  personal: { bg: "bg-orange-100", text: "text-orange-700" },
};
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-amber-100", text: "text-amber-700" },
  approved: { bg: "bg-green-100", text: "text-green-700" },
  rejected: { bg: "bg-red-100", text: "text-red-700" },
};

export default function TeamDetail() {
  const { teamId } = useParams<{ teamId: string }>();
  const id = Number(teamId);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [balances, setBalances] = useState<SwapBalance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteTeam, setShowDeleteTeam] = useState(false);

  const [showEditTeam, setShowEditTeam] = useState(false);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamDesc, setEditTeamDesc] = useState("");

  const [showAddMember, setShowAddMember] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [sleepsIn, setSleepsIn] = useState(false);
  const [isLeader, setIsLeader] = useState(false);

  const [editMember, setEditMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState("");
  const [editSleeps, setEditSleeps] = useState(false);
  const [editIsLeader, setEditIsLeader] = useState(false);
  const [editCredit, setEditCredit] = useState(0);
  const [editDayShiftCredit, setEditDayShiftCredit] = useState(0);
  const [editWeight, setEditWeight] = useState(1.0);

  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);

  const isAdmin = useMemo(() => {
    if (!user) return false;
    if (user.platform_role === "shifter_admin") return true;
    const tm = user.teams.find((t) => t.id === id);
    if (tm?.team_role === "team_admin") return true;
    return user.organizations.some((o) => o.org_role === "organization_admin");
  }, [user, id]);

  const load = async () => {
    try {
      const [teamRes, balanceRes, leaveRes] = await Promise.all([
        getTeam(id),
        getSwapBalance(id),
        getLeaveRequests(id),
      ]);
      setTeam(teamRes.data.team);
      setMembers(teamRes.data.members);
      setBalances(balanceRes.data.balances);
      setLeaveRequests(leaveRes.data.leave_requests);
    } catch {
      toast.error("Failed to load team");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const getBalance = (memberId: number) =>
    balances.find((b) => b.member_id === memberId);

  const pendingLeave = leaveRequests.filter((r) => r.status === "pending");
  const recentLeave = leaveRequests.filter((r) => r.status !== "pending").slice(0, 5);

  const handleApproveLeave = async (lrId: number) => {
    try {
      await approveLeaveRequest(lrId);
      toast.success("Leave approved");
      load();
    } catch { toast.error("Failed to approve"); }
  };
  const handleRejectLeave = async (lrId: number) => {
    try {
      await rejectLeaveRequest(lrId);
      toast.success("Leave rejected");
      load();
    } catch { toast.error("Failed to reject"); }
  };

  const handleAddMember = async () => {
    if (!memberName.trim()) { toast.error("Member name is required"); return; }
    try {
      await createMember(id, { name: memberName.trim(), sleeps_in_building: sleepsIn, is_leader: isLeader });
      toast.success("Member added");
      setShowAddMember(false);
      setMemberName("");
      setSleepsIn(false);
      setIsLeader(false);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to add member");
    }
  };

  const handleEditMember = async () => {
    if (!editMember) return;
    try {
      await updateMember(editMember.id, {
        name: editName.trim(),
        sleeps_in_building: editSleeps,
        is_leader: editIsLeader,
        shift_credit: editCredit,
        day_shift_credit: editDayShiftCredit,
        shift_weight: editWeight,
      });
      toast.success("Member updated");
      setEditMember(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to update member");
    }
  };

  const handleDeleteMember = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMember(deleteTarget.id);
      toast.success("Member deleted");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Failed to delete member");
    }
  };

  const handleDeleteTeam = async () => {
    try {
      await deleteTeam(id);
      toast.success("Team deleted");
      navigate("/");
    } catch {
      toast.error("Failed to delete team");
    }
  };

  const handleEditTeam = async () => {
    if (!editTeamName.trim()) { toast.error("Team name is required"); return; }
    try {
      await updateTeam(id, { name: editTeamName.trim(), description: editTeamDesc.trim() || null });
      toast.success("Team updated");
      setShowEditTeam(false);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to update team");
    }
  };

  if (loading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>;
  }

  if (!team) return <p className="text-gray-500">Team not found.</p>;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/" className="hover:text-gray-700 flex items-center gap-1">
          <ChevronLeft size={14} /> Dashboard
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{team.name}</span>
      </div>

      {/* Team Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl font-bold">
              {team.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">{team.name}</h2>
                <button
                  onClick={() => { setShowEditTeam(true); setEditTeamName(team.name); setEditTeamDesc(team.description || ""); }}
                  className="p-1 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                  title="Edit team name & description"
                >
                  <Pencil size={14} />
                </button>
              </div>
              {team.description && <p className="text-sm text-gray-500">{team.description}</p>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link
              to={`/teams/${id}/schedule`}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Calendar size={16} /> Schedule
            </Link>
            <Link
              to={`/teams/${id}/past-shifts`}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <Clock size={16} /> Past Shifts
            </Link>
            <Link
              to={`/teams/${id}/leave`}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <CalendarOff size={16} /> Leave
            </Link>
            <button
              onClick={() => setShowDeleteTeam(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
            >
              <Trash2 size={16} /> Delete Team
            </button>
          </div>
        </div>
      </div>

      {/* Members Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Members ({members.length})</h3>
        <button
          onClick={() => setShowAddMember(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
        >
          <Plus size={14} /> Add Member
        </button>
      </div>

      {/* Members List */}
      {members.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">No members yet. Add your first member.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((m) => {
            const bal = getBalance(m.id);
            return (
              <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-semibold">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">{m.name}</h4>
                      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                        {m.is_leader && (
                          <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded font-medium" title="Team leader -- excluded from auto-generated schedules">
                            Leader
                          </span>
                        )}
                        <span>{m.shift_count} shift{m.shift_count !== 1 ? "s" : ""}</span>
                        {m.shift_credit !== 0 && (
                          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded" title="Shift credit adjusts night shift fairness">
                            Shift: {m.shift_credit > 0 ? "+" : ""}{m.shift_credit}
                          </span>
                        )}
                        {m.day_shift_credit !== 0 && (
                          <span className="px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded" title="Day Shift credit adjusts day shift fairness">
                            Day Shift: {m.day_shift_credit > 0 ? "+" : ""}{m.day_shift_credit}
                          </span>
                        )}
                        {m.sleeps_in_building && (
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">Sleeps in</span>
                        )}
                        {bal && bal.net_balance !== 0 && (
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              bal.net_balance > 0
                                ? "bg-red-50 text-red-600"
                                : "bg-green-50 text-green-600"
                            }`}
                            title={`Covers done: ${bal.covers_done}, Covers received: ${bal.covers_received}`}
                          >
                            Swap: {bal.net_balance > 0 ? "+" : ""}{bal.net_balance}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditMember(m); setEditName(m.name); setEditSleeps(m.sleeps_in_building); setEditIsLeader(m.is_leader); setEditCredit(m.shift_credit); setEditDayShiftCredit(m.day_shift_credit); setEditWeight(m.shift_weight ?? 1.0); }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                      title="Edit member"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(m)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                      title="Delete member"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ Leave Management Section ══ */}
      <div className="mt-8 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarOff size={18} className="text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Leave Requests</h3>
            {pendingLeave.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
                {pendingLeave.length} pending
              </span>
            )}
          </div>
          <Link
            to={`/teams/${id}/leave`}
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Manage All <ArrowRight size={14} />
          </Link>
        </div>

        {/* Pending Requests (actionable) */}
        {pendingLeave.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-2">Awaiting Review</h4>
            <div className="space-y-2">
              {pendingLeave.map((lr) => {
                const Icon = LEAVE_ICONS[lr.leave_type];
                const colors = LEAVE_COLORS[lr.leave_type];
                const days = dayjs(lr.end_date).diff(dayjs(lr.start_date), "day") + 1;
                return (
                  <div key={lr.id} className="bg-white rounded-xl border border-amber-200 p-3 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{lr.member_name}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                          {lr.leave_type}
                        </span>
                        {lr.partial_day && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                            {lr.partial_day}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {dayjs(lr.start_date).format("MMM D")}
                        {lr.start_date !== lr.end_date && ` – ${dayjs(lr.end_date).format("MMM D")}`}
                        {" "}({days} day{days > 1 ? "s" : ""})
                        {lr.notes && <span className="italic"> — {lr.notes}</span>}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleApproveLeave(lr.id)}
                          className="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                          title="Approve"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => handleRejectLeave(lr.id)}
                          className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          title="Reject"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent leave history */}
        {recentLeave.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Recent</h4>
            <div className="space-y-1.5">
              {recentLeave.map((lr) => {
                const Icon = LEAVE_ICONS[lr.leave_type];
                const colors = LEAVE_COLORS[lr.leave_type];
                const statusColors = STATUS_COLORS[lr.status];
                return (
                  <div key={lr.id} className="bg-white rounded-lg border border-gray-200 px-3 py-2 flex items-center gap-3">
                    <Icon size={14} className={colors.text} />
                    <span className="text-sm text-gray-900 font-medium">{lr.member_name}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                      {lr.leave_type}
                    </span>
                    <span className="text-xs text-gray-500 flex-1">
                      {dayjs(lr.start_date).format("MMM D")}
                      {lr.start_date !== lr.end_date && ` – ${dayjs(lr.end_date).format("MMM D")}`}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusColors.bg} ${statusColors.text}`}>
                      {lr.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {leaveRequests.length === 0 && (
          <div className="text-center py-8 bg-white rounded-xl border border-gray-200">
            <CalendarOff size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No leave requests yet.</p>
            <Link
              to={`/teams/${id}/leave`}
              className="inline-flex items-center gap-1.5 mt-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Submit a request <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </div>

      {/* Tip */}
      <p className="mt-4 text-xs text-gray-400 text-center">
        To manage member availability, go to{" "}
        <Link to={`/teams/${id}/schedule`} className="text-indigo-500 hover:text-indigo-700 underline">
          Schedule
        </Link>{" "}
        and open the Availability panel for the month you need.
      </p>

      {/* Add Member Modal */}
      <Modal open={showAddMember} onClose={() => setShowAddMember(false)} title="Add Member">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="Member name"
              autoFocus
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={sleepsIn} onChange={(e) => setSleepsIn(e.target.checked)} className="rounded border-gray-300" />
            Sleeps in building
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isLeader} onChange={(e) => setIsLeader(e.target.checked)} className="rounded border-gray-300" />
            Team Leader
          </label>
          {isLeader && (
            <p className="text-xs text-amber-600">
              Leaders are excluded from auto-generated schedules but can still cover shifts via swaps or manual assignment.
            </p>
          )}
          <p className="text-xs text-gray-500">
            Shift credit will be auto-set to the team minimum for fairness.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowAddMember(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleAddMember} className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Add Member</button>
          </div>
        </div>
      </Modal>

      {/* Edit Member Modal */}
      <Modal open={!!editMember} onClose={() => setEditMember(null)} title="Edit Member">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={editSleeps} onChange={(e) => setEditSleeps(e.target.checked)} className="rounded border-gray-300" />
            Sleeps in building
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={editIsLeader} onChange={(e) => setEditIsLeader(e.target.checked)} className="rounded border-gray-300" />
            Team Leader
          </label>
          {editIsLeader && (
            <p className="text-xs text-amber-600">
              Leaders are excluded from auto-generated schedules but can still cover shifts via swaps or manual assignment.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shift Credit</label>
              <input
                type="number"
                value={editCredit}
                onChange={(e) => setEditCredit(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">Adjusts night shift fairness.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Day Shift Credit</label>
              <input
                type="number"
                value={editDayShiftCredit}
                onChange={(e) => setEditDayShiftCredit(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">Adjusts day shift fairness.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shift Weight</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="2.0"
                value={editWeight}
                onChange={(e) => setEditWeight(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">1.0 = full load, 0.5 = half.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setEditMember(null)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleEditMember} className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Save</button>
          </div>
        </div>
      </Modal>

      {/* Edit Team Modal */}
      <Modal open={showEditTeam} onClose={() => setShowEditTeam(false)} title="Edit Team">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
            <input
              value={editTeamName}
              onChange={(e) => setEditTeamName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="Team name"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <textarea
              value={editTeamDesc}
              onChange={(e) => setEditTeamDesc(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
              placeholder="Brief description of this team"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowEditTeam(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleEditTeam} className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Save</button>
          </div>
        </div>
      </Modal>

      {/* Delete Member Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteMember}
        title="Delete Member"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? All their shifts and unavailabilities will also be removed.`}
        confirmLabel="Delete"
        danger
      />

      {/* Delete Team Confirmation */}
      <ConfirmDialog
        open={showDeleteTeam}
        onClose={() => setShowDeleteTeam(false)}
        onConfirm={handleDeleteTeam}
        title="Delete Team"
        message={`Are you sure you want to delete "${team?.name}"? This will permanently remove all members, shifts, and unavailabilities associated with this team.`}
        confirmLabel="Delete Team"
        danger
      />
    </div>
  );
}
