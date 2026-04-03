import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import {
  CalendarOff, Check, X, Clock, ChevronLeft, Plus,
  Palmtree, Thermometer, User, CalendarDays, Repeat, Trash2, RefreshCw,
} from "lucide-react";
import {
  getLeaveRequests, createLeaveRequest, approveLeaveRequest, rejectLeaveRequest,
  cancelLeaveRequest, getMembers, getRecurringUnavailabilities,
  createRecurringUnavailability, deleteRecurringUnavailability,
  applyRecurringUnavailabilities,
  type LeaveRequest, type LeaveType, type Member, type RecurringUnavailabilityEntry,
} from "../api";
import { useAuth } from "../contexts/AuthContext";
import Modal from "../components/Modal";

const LEAVE_TYPE_CONFIG: Record<LeaveType, { label: string; icon: typeof Palmtree; color: string; bg: string }> = {
  vacation: { label: "Vacation", icon: Palmtree, color: "text-blue-700", bg: "bg-blue-100" },
  sick: { label: "Sick Leave", icon: Thermometer, color: "text-red-700", bg: "bg-red-100" },
  personal: { label: "Personal", icon: User, color: "text-orange-700", bg: "bg-orange-100" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-amber-700", bg: "bg-amber-100" },
  approved: { label: "Approved", color: "text-green-700", bg: "bg-green-100" },
  rejected: { label: "Rejected", color: "text-red-700", bg: "bg-red-100" },
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function LeaveManagementPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const id = Number(teamId);
  const { user } = useAuth();

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);

  // Create form state
  const [formMemberId, setFormMemberId] = useState<number | "">("");
  const [formType, setFormType] = useState<LeaveType>("vacation");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formPartial, setFormPartial] = useState<"" | "morning" | "afternoon">("");
  const [formNotes, setFormNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Recurring state
  const [recurringMemberId, setRecurringMemberId] = useState<number | "">("");
  const [recurringPatterns, setRecurringPatterns] = useState<RecurringUnavailabilityEntry[]>([]);
  const [recDow, setRecDow] = useState<number>(0);
  const [recFreq, setRecFreq] = useState<"weekly" | "biweekly">("weekly");
  const [recReason, setRecReason] = useState("");
  const [loadingRecurring, setLoadingRecurring] = useState(false);

  const isAdmin = useMemo(() => {
    if (!user) return false;
    if (user.platform_role === "shifter_admin") return true;
    const tm = user.teams.find((t) => t.id === id);
    if (tm?.team_role === "team_admin") return true;
    const org = user.organizations.find((o) => o.org_role === "organization_admin");
    return !!org;
  }, [user, id]);

  const load = async () => {
    try {
      const params = statusFilter !== "all" ? { status: statusFilter } : undefined;
      const [lrRes, mRes] = await Promise.all([
        getLeaveRequests(id, params),
        getMembers(id),
      ]);
      setRequests(lrRes.data.leave_requests);
      setMembers(mRes.data.members);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); load(); }, [id, statusFilter]);

  const handleCreate = async () => {
    if (!formMemberId || !formStart || !formEnd) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSubmitting(true);
    try {
      await createLeaveRequest(id, {
        member_id: formMemberId as number,
        leave_type: formType,
        start_date: formStart,
        end_date: formEnd,
        partial_day: formPartial || null,
        notes: formNotes,
      });
      toast.success("Leave request submitted");
      setShowCreateModal(false);
      resetForm();
      load();
    } catch {
      toast.error("Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormMemberId("");
    setFormType("vacation");
    setFormStart("");
    setFormEnd("");
    setFormPartial("");
    setFormNotes("");
  };

  const handleAction = async () => {
    if (!actionId || !actionType) return;
    try {
      if (actionType === "approve") {
        await approveLeaveRequest(actionId, reviewNotes);
        toast.success("Leave approved");
      } else {
        await rejectLeaveRequest(actionId, reviewNotes);
        toast.success("Leave rejected");
      }
      setActionId(null);
      setActionType(null);
      setReviewNotes("");
      load();
    } catch {
      toast.error(`Failed to ${actionType}`);
    }
  };

  const handleCancel = async (lrId: number) => {
    try {
      await cancelLeaveRequest(lrId);
      toast.success("Request cancelled");
      load();
    } catch {
      toast.error("Failed to cancel");
    }
  };

  const loadRecurringPatterns = async (memberId: number) => {
    setLoadingRecurring(true);
    try {
      const { data } = await getRecurringUnavailabilities(memberId);
      setRecurringPatterns(data.recurring_unavailabilities);
    } catch {
      toast.error("Failed to load patterns");
    } finally {
      setLoadingRecurring(false);
    }
  };

  const handleAddRecurring = async () => {
    if (recurringMemberId === "") return;
    try {
      await createRecurringUnavailability(recurringMemberId as number, {
        day_of_week: recDow,
        frequency: recFreq,
        reason: recReason,
      });
      toast.success("Pattern added");
      loadRecurringPatterns(recurringMemberId as number);
    } catch {
      toast.error("Failed to add pattern");
    }
  };

  const handleDeleteRecurring = async (recId: number) => {
    try {
      await deleteRecurringUnavailability(recId);
      toast.success("Pattern removed");
      if (recurringMemberId !== "") loadRecurringPatterns(recurringMemberId as number);
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleApplyRecurring = async () => {
    if (recurringMemberId === "") return;
    const now = dayjs();
    try {
      const { data } = await applyRecurringUnavailabilities(
        recurringMemberId as number, now.year(), now.month() + 1
      );
      toast.success(data.message);
    } catch {
      toast.error("Failed to apply");
    }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  if (loading) {
    return (
      <div className="max-w-4xl space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/teams/${id}`} className="p-1.5 rounded-lg hover:bg-gray-100">
          <ChevronLeft size={20} className="text-gray-500" />
        </Link>
        <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
          <CalendarOff size={20} />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">Leave Management</h2>
          <p className="text-sm text-gray-500">Manage time-off requests and recurring patterns.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRecurringModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <Repeat size={14} /> Recurring
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus size={14} /> New Request
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: "all", label: "All" },
          { key: "pending", label: "Pending", count: pendingCount },
          { key: "approved", label: "Approved" },
          { key: "rejected", label: "Rejected" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              statusFilter === tab.key
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                statusFilter === tab.key ? "bg-white/20" : "bg-amber-100 text-amber-700"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Requests list */}
      {requests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <CalendarOff size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">No leave requests found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((lr) => {
            const typeConf = LEAVE_TYPE_CONFIG[lr.leave_type];
            const statusConf = STATUS_CONFIG[lr.status];
            const Icon = typeConf.icon;
            const days = dayjs(lr.end_date).diff(dayjs(lr.start_date), "day") + 1;

            return (
              <div key={lr.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg ${typeConf.bg} ${typeConf.color} flex items-center justify-center shrink-0`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{lr.member_name}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeConf.bg} ${typeConf.color}`}>
                        {typeConf.label}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusConf.bg} ${statusConf.color}`}>
                        {statusConf.label}
                      </span>
                      {lr.partial_day && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          {lr.partial_day === "morning" ? "Morning only" : "Afternoon only"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <CalendarDays size={12} />
                        {dayjs(lr.start_date).format("MMM D")}
                        {lr.start_date !== lr.end_date && ` – ${dayjs(lr.end_date).format("MMM D")}`}
                      </span>
                      <span>{days} day{days > 1 ? "s" : ""}</span>
                      {lr.created_at && (
                        <span>Submitted {dayjs(lr.created_at).format("MMM D, HH:mm")}</span>
                      )}
                    </div>
                    {lr.notes && (
                      <p className="text-xs text-gray-500 mt-1 italic">"{lr.notes}"</p>
                    )}
                    {lr.review_notes && (
                      <p className="text-xs text-gray-600 mt-1">
                        <span className="font-medium">Review:</span> {lr.review_notes}
                        {lr.reviewed_by_name && <span className="text-gray-400"> — {lr.reviewed_by_name}</span>}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {lr.status === "pending" && isAdmin && (
                      <>
                        <button
                          onClick={() => { setActionId(lr.id); setActionType("approve"); }}
                          className="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                          title="Approve"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => { setActionId(lr.id); setActionType("reject"); }}
                          className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          title="Reject"
                        >
                          <X size={16} />
                        </button>
                      </>
                    )}
                    {lr.status === "pending" && (
                      <button
                        onClick={() => handleCancel(lr.id)}
                        className="p-2 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors"
                        title="Cancel"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    {lr.status === "approved" && isAdmin && (
                      <button
                        onClick={() => handleCancel(lr.id)}
                        className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                        title="Revoke"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Approve/Reject review modal */}
      <Modal
        open={actionId !== null}
        onClose={() => { setActionId(null); setActionType(null); setReviewNotes(""); }}
        title={actionType === "approve" ? "Approve Leave Request" : "Reject Leave Request"}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {actionType === "approve"
              ? "Approving will automatically block these dates in the schedule."
              : "The employee will be notified of the rejection."}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Add a note..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setActionId(null); setActionType(null); setReviewNotes(""); }}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAction}
              className={`px-4 py-2 text-sm font-medium rounded-lg text-white ${
                actionType === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {actionType === "approve" ? "Approve" : "Reject"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Create leave request modal */}
      <Modal open={showCreateModal} onClose={() => { setShowCreateModal(false); resetForm(); }} title="New Leave Request">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Member</label>
            <select
              value={formMemberId}
              onChange={(e) => setFormMemberId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="">Select member...</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(LEAVE_TYPE_CONFIG) as [LeaveType, typeof LEAVE_TYPE_CONFIG["vacation"]][]).map(([key, conf]) => {
                const Icon = conf.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setFormType(key)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      formType === key
                        ? `border-indigo-500 ${conf.bg}`
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <Icon size={16} className={formType === key ? conf.color : "text-gray-400"} />
                    <span className={`block text-xs font-medium mt-1 ${formType === key ? conf.color : "text-gray-600"}`}>
                      {conf.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={formStart}
                onChange={(e) => {
                  setFormStart(e.target.value);
                  if (!formEnd || e.target.value > formEnd) setFormEnd(e.target.value);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={formEnd}
                min={formStart}
                onChange={(e) => setFormEnd(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          {formStart && formStart === formEnd && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Partial Day (optional)</label>
              <div className="flex gap-2">
                {[
                  { value: "", label: "Full day" },
                  { value: "morning", label: "Morning only" },
                  { value: "afternoon", label: "Afternoon only" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFormPartial(opt.value as typeof formPartial)}
                    className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                      formPartial === opt.value
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Reason or context..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => { setShowCreateModal(false); resetForm(); }}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Recurring patterns modal */}
      <Modal
        open={showRecurringModal}
        onClose={() => setShowRecurringModal(false)}
        title="Recurring Unavailability Patterns"
        wide
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Member</label>
            <select
              value={recurringMemberId}
              onChange={(e) => {
                const mid = e.target.value ? Number(e.target.value) : "";
                setRecurringMemberId(mid);
                if (mid !== "") loadRecurringPatterns(mid as number);
                else setRecurringPatterns([]);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="">Select member...</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          {recurringMemberId !== "" && (
            <>
              {/* Existing patterns */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Current Patterns</h4>
                {loadingRecurring ? (
                  <div className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                ) : recurringPatterns.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No recurring patterns set.</p>
                ) : (
                  <div className="space-y-2">
                    {recurringPatterns.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <div className="text-sm">
                          <span className="font-medium text-gray-900">Every {p.frequency === "biweekly" ? "other " : ""}{DAY_LABELS[p.day_of_week]}</span>
                          {p.reason && <span className="text-gray-500 ml-2">— {p.reason}</span>}
                        </div>
                        <button
                          onClick={() => handleDeleteRecurring(p.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add new pattern */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Add Pattern</h4>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Day</label>
                    <select
                      value={recDow}
                      onChange={(e) => setRecDow(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                      {DAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Frequency</label>
                    <select
                      value={recFreq}
                      onChange={(e) => setRecFreq(e.target.value as typeof recFreq)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Reason</label>
                    <input
                      type="text"
                      value={recReason}
                      onChange={(e) => setRecReason(e.target.value)}
                      placeholder="Optional..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <button
                    onClick={handleAddRecurring}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shrink-0"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Apply to current month */}
              <div className="border-t pt-4">
                <button
                  onClick={handleApplyRecurring}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  <RefreshCw size={14} /> Apply patterns to {dayjs().format("MMMM YYYY")}
                </button>
                <p className="text-xs text-gray-500 mt-1">
                  Generates unavailability records for this month based on the patterns above.
                </p>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
