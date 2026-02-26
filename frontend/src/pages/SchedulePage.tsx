import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import {
  ChevronLeft, ChevronRight, Wand2, Download, Trash2, AlertTriangle,
  ArrowLeftRight, Undo2, ChevronDown, ChevronUp, Plus, X, Users, UserPlus, Pencil,
} from "lucide-react";
import {
  getScheduleView, generateSchedule, deleteSchedule, assignShift,
  swapShift, revertSwap, reassignShift,
  bulkCreateUnavailability, deleteUnavailability,
  reassignShotefDay,
  type Team, type ShiftEntry, type Suggestion, type Member, type Unavailability,
  type ShotefDayEntry, type ShotefSubNeed,
} from "../api";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";

const COLORS = [
  "bg-indigo-100 text-indigo-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-teal-100 text-teal-800",
  "bg-orange-100 text-orange-800",
  "bg-pink-100 text-pink-800",
  "bg-lime-100 text-lime-800",
];

export default function SchedulePage() {
  const { teamId } = useParams<{ teamId: string }>();
  const id = Number(teamId);

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [month, setMonth] = useState(dayjs().startOf("month"));
  const [shifts, setShifts] = useState<ShiftEntry[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Swap state
  const [swapShiftTarget, setSwapShiftTarget] = useState<ShiftEntry | null>(null);
  const [swapMemberId, setSwapMemberId] = useState<number | "">("");
  const [swapping, setSwapping] = useState(false);
  const [showSwapHistory, setShowSwapHistory] = useState(false);

  // Availability panel state
  const [showAvailability, setShowAvailability] = useState(false);
  const [unavMemberId, setUnavMemberId] = useState<number | null>(null);
  const [unavDates, setUnavDates] = useState<Set<string>>(new Set());
  const [unavReason, setUnavReason] = useState("");

  const [assigning, setAssigning] = useState<string | null>(null);

  // Inline edit state
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [editingShotefDate, setEditingShotefDate] = useState<string | null>(null);

  // Shotef state
  const [shotefDays, setShotefDays] = useState<ShotefDayEntry[]>([]);
  const [shotefSubNeeds, setShotefSubNeeds] = useState<ShotefSubNeed[]>([]);
  const [showShotefSubs, setShowShotefSubs] = useState(false);
  const [assigningShotef, setAssigningShotef] = useState<string | null>(null);

  const isPastMonth = month.isBefore(dayjs().startOf("month"));

  const load = async () => {
    try {
      const { data } = await getScheduleView(id, month.year(), month.month() + 1);
      setTeam(data.team);
      setMembers(data.members);
      setShifts(data.shifts);
      setShotefDays(data.shotef_days);
    } catch {
      toast.error("Failed to load schedule");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); load(); }, [id, month]);

  const monthUnavailabilities = useMemo(() => {
    const result: Record<number, Unavailability[]> = {};
    const monthStr = month.format("YYYY-MM");
    for (const m of members) {
      result[m.id] = (m.unavailabilities || []).filter((u) => u.date.startsWith(monthStr));
    }
    return result;
  }, [members, month]);

  const totalMonthUnavs = useMemo(() =>
    Object.values(monthUnavailabilities).reduce((sum, arr) => sum + arr.length, 0),
  [monthUnavailabilities]);

  const memberColorMap = useMemo(() => {
    const names = [...new Set(shifts.map((s) => s.member_name))];
    const map: Record<string, string> = {};
    names.forEach((n, i) => { map[n] = COLORS[i % COLORS.length]; });
    return map;
  }, [shifts]);

  const swappedShifts = useMemo(() => shifts.filter((s) => s.swap), [shifts]);

  const shotefByDate = useMemo(() => {
    const map: Record<string, { memberName: string; shotefDayId: number }> = {};
    for (const sd of shotefDays) {
      map[sd.date] = { memberName: sd.member_name, shotefDayId: sd.id };
    }
    return map;
  }, [shotefDays]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data } = await generateSchedule(id, month.year(), month.month() + 1);
      toast.success("Schedule generated");
      setSuggestions(data.suggestions);
      if (data.suggestions.length > 0) setShowSuggestions(true);
      setShotefSubNeeds(data.shotef_needs_substitute || []);
      if ((data.shotef_needs_substitute || []).length > 0) setShowShotefSubs(true);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleAssign = async (memberName: string, date: string) => {
    setAssigning(`${date}-${memberName}`);
    try {
      const { data } = await assignShift(id, memberName, date);
      toast.success(data.message);
      const filled = new Set(data.assigned_dates || [date]);
      setSuggestions((prev) => prev.filter((s) => !filled.has(s.date)));
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to assign");
    } finally {
      setAssigning(null);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSchedule(id, month.year(), month.month() + 1);
      toast.success("Schedule deleted");
      setShifts([]);
      setShotefDays([]);
    } catch {
      toast.error("Failed to delete schedule");
    }
  };

  const handleExport = () => {
    window.open(`/api/teams/${id}/schedule/export?year=${month.year()}&month=${month.month() + 1}`);
  };

  const handleSwap = async () => {
    if (!swapShiftTarget || !swapMemberId) return;
    setSwapping(true);
    try {
      await swapShift(id, swapShiftTarget.id, Number(swapMemberId));
      toast.success("Shift swapped");
      setSwapShiftTarget(null);
      setSwapMemberId("");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Swap failed");
    } finally {
      setSwapping(false);
    }
  };

  const handleRevertSwap = async (swapId: number) => {
    try {
      await revertSwap(swapId);
      toast.success("Swap reverted");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Revert failed");
    }
  };

  const handleAddUnav = async () => {
    if (!unavMemberId || unavDates.size === 0) { toast.error("Select a member and at least one date"); return; }
    try {
      const { data } = await bulkCreateUnavailability(unavMemberId, { dates: [...unavDates].sort(), reason: unavReason });
      toast.success(data.message);
      setUnavMemberId(null);
      setUnavDates(new Set());
      setUnavReason("");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to add unavailability");
    }
  };

  const toggleUnavDate = (dateStr: string) => {
    setUnavDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  const handleDeleteUnav = async (unavId: number) => {
    try {
      await deleteUnavailability(unavId);
      toast.success("Unavailability removed");
      load();
    } catch {
      toast.error("Failed to remove unavailability");
    }
  };

  const handleReassignShotefDay = async (dateStr: string, memberId: number) => {
    const sd = shotefDays.find((d) => d.date === dateStr);
    if (!sd) return;
    const key = `${sd.id}-${dateStr}-${memberId}`;
    setAssigningShotef(key);
    try {
      await reassignShotefDay(id, sd.id, memberId);
      toast.success("Shotef day reassigned");
      setShotefSubNeeds((prev) => prev.filter((n) => n.date !== dateStr));
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to reassign");
    } finally {
      setAssigningShotef(null);
    }
  };

  const handleReassignShift = async (shiftId: number, memberId: number) => {
    try {
      await reassignShift(shiftId, memberId);
      toast.success("Shift reassigned");
      setEditingShiftId(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to reassign");
    }
  };

  const handleEditShotefDay = async (dateStr: string, memberId: number) => {
    const sd = shotefDays.find((d) => d.date === dateStr);
    if (!sd) return;
    try {
      await reassignShotefDay(id, sd.id, memberId);
      toast.success("Shotef reassigned");
      setEditingShotefDate(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to reassign");
    }
  };

  // Build calendar grid
  const firstDay = month.startOf("month");
  const daysInMonth = month.daysInMonth();
  const startPad = firstDay.day();
  const cells: (dayjs.Dayjs | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(month.date(d));

  const shiftsByDate: Record<string, ShiftEntry[]> = {};
  shifts.forEach((s) => {
    if (!shiftsByDate[s.shift_date]) shiftsByDate[s.shift_date] = [];
    shiftsByDate[s.shift_date].push(s);
  });

  if (loading && !team) {
    return <div className="h-96 bg-gray-100 rounded-xl animate-pulse" />;
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/" className="hover:text-gray-700">Dashboard</Link>
        <span>/</span>
        <Link to={`/teams/${id}`} className="hover:text-gray-700">{team?.name}</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Schedule</span>
      </div>

      {/* Month nav + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setMonth(month.subtract(1, "month"))} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50">
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-lg font-semibold text-gray-900 min-w-[160px] text-center">
            {month.format("MMMM YYYY")}
          </h2>
          <button onClick={() => setMonth(month.add(1, "month"))} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowAvailability(!showAvailability)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
              showAvailability
                ? "bg-amber-50 border-amber-300 text-amber-700"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Users size={14} />
            Availability
            {totalMonthUnavs > 0 && (
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-red-100 text-red-700 font-semibold">
                {totalMonthUnavs}
              </span>
            )}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || isPastMonth}
            title={isPastMonth ? "Cannot generate schedules for past months" : undefined}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Wand2 size={14} /> {generating ? "Generating..." : "Generate"}
          </button>
          {shifts.length > 0 && (
            <>
              <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
                <Download size={14} /> Export
              </button>
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                <Trash2 size={14} /> Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Member Availability Panel ── */}
      {showAvailability && (
        <div className="mb-5 bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Member Availability — {month.format("MMMM YYYY")}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Mark which dates each member is unavailable before generating the schedule.
              </p>
            </div>
            <button onClick={() => setShowAvailability(false)} className="p-1 rounded hover:bg-amber-100 text-gray-500">
              <X size={16} />
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {members.map((m) => {
              const mUnavs = monthUnavailabilities[m.id] || [];
              return (
                <div key={m.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">{m.name}</span>
                      {mUnavs.length === 0 && (
                        <span className="text-xs text-green-600">Available all month</span>
                      )}
                    </div>
                    {mUnavs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        {mUnavs
                          .sort((a, b) => a.date.localeCompare(b.date))
                          .map((u) => (
                          <span
                            key={u.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-50 text-red-700 group"
                          >
                            {dayjs(u.date).format("ddd D")}
                            {u.reason ? ` — ${u.reason}` : ""}
                            <button
                              onClick={() => handleDeleteUnav(u.id)}
                              className="opacity-0 group-hover:opacity-100 hover:text-red-900 transition-opacity"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setUnavMemberId(m.id);
                      setUnavDates(new Set());
                      setUnavReason("");
                    }}
                    className="p-1 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-50 shrink-0"
                    title={`Add unavailability for ${m.name}`}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Dual Calendars ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

      {/* Night Shifts Calendar */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500" />
          Night Shifts
        </h3>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 border-b border-gray-200 bg-gray-50">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            const dateStr = day?.format("YYYY-MM-DD");
            const dayShifts = dateStr ? shiftsByDate[dateStr] || [] : [];
            const isWeekend = day && (day.day() === 5 || day.day() === 6);
            const isToday = day && day.isSame(dayjs(), "day");

            return (
              <div
                key={i}
                className={`min-h-[80px] p-1.5 border-b border-r border-gray-100 ${
                  !day ? "bg-gray-50/50" : isWeekend ? "bg-amber-50/30" : ""
                }`}
              >
                {day && (
                  <>
                    <div className={`text-xs font-medium mb-1 ${isToday ? "w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center" : "text-gray-500"}`}>
                      {day.date()}
                    </div>
                    {dayShifts.map((s) => (
                      <div key={s.id} className="mb-0.5">
                        {editingShiftId === s.id ? (
                          <select
                            autoFocus
                            className="w-full text-[11px] px-1 py-0.5 border border-indigo-300 rounded bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) handleReassignShift(s.id, Number(e.target.value));
                            }}
                            onBlur={() => setEditingShiftId(null)}
                          >
                            <option value="">Select member...</option>
                            {members.filter((m) => m.id !== s.member_id).map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        ) : (
                          <div className={`text-xs px-1.5 py-0.5 rounded font-medium flex items-center gap-1 group ${memberColorMap[s.member_name] || "bg-gray-100 text-gray-700"}`}>
                            <span className="truncate flex-1">
                              {s.member_name}
                              {s.swap && (
                                <span className="text-[10px] opacity-70 ml-0.5" title={`Swapped from ${s.swap.original_member_name}`}>
                                  (was {s.swap.original_member_name})
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => setEditingShiftId(s.id)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 shrink-0"
                              title="Edit assignment"
                            >
                              <Pencil size={10} />
                            </button>
                            {!s.swap ? (
                              <button
                                onClick={() => { setSwapShiftTarget(s); setSwapMemberId(""); }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 shrink-0"
                                title="Swap shift"
                              >
                                <ArrowLeftRight size={10} />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRevertSwap(s.swap!.id)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 shrink-0"
                                title="Revert swap"
                              >
                                <Undo2 size={10} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      {shifts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(memberColorMap).map(([name, color]) => (
            <span key={name} className={`text-xs px-2 py-1 rounded-full font-medium ${color}`}>
              {name}
            </span>
          ))}
        </div>
      )}
      </div>

      {/* Shotef (Day Duty) Calendar */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-teal-500" />
          Shotef (Day Duty)
          {shotefDays.length === 0 && (
            <span className="text-xs text-gray-400 font-normal">&mdash; No data for this month</span>
          )}
        </h3>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 border-b border-gray-200 bg-gray-50">
                {d}
              </div>
            ))}
            {cells.map((day, i) => {
              const dateStr = day?.format("YYYY-MM-DD");
              const dayNum = day?.day();
              const isWeekend = day && (dayNum === 5 || dayNum === 6);
              const isShotefDay = day && dayNum !== undefined && dayNum >= 0 && dayNum <= 4;
              const isToday = day && day.isSame(dayjs(), "day");
              const shotefInfo = dateStr ? shotefByDate[dateStr] : undefined;

              return (
                <div
                  key={i}
                  className={`min-h-[80px] p-1.5 border-b border-r border-gray-100 ${
                    !day ? "bg-gray-50/50" : isWeekend ? "bg-gray-100/60" : ""
                  }`}
                >
                  {day && (
                    <>
                      <div className={`text-xs font-medium mb-1 ${isToday ? "w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center" : "text-gray-500"}`}>
                        {day.date()}
                      </div>
                      {isShotefDay && shotefInfo && (
                        <div className="mb-0.5">
                          {editingShotefDate === dateStr ? (
                            <select
                              autoFocus
                              className="w-full text-[11px] px-1 py-0.5 border border-teal-300 rounded bg-white focus:ring-1 focus:ring-teal-500 outline-none"
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) handleEditShotefDay(dateStr!, Number(e.target.value));
                              }}
                              onBlur={() => setEditingShotefDate(null)}
                            >
                              <option value="">Select member...</option>
                              {members.filter((m) => !m.is_leader).map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="text-xs px-1.5 py-0.5 rounded font-medium bg-teal-100 text-teal-800 flex items-center gap-1 group">
                              <span className="truncate flex-1">{shotefInfo.memberName}</span>
                              <button
                                onClick={() => setEditingShotefDate(dateStr!)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 shrink-0"
                                title="Edit shotef"
                              >
                                <Pencil size={10} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {isShotefDay && !shotefInfo && shotefDays.length > 0 && (
                        <div className="text-[10px] text-gray-300 italic">—</div>
                      )}
                      {isWeekend && (
                        <div className="text-[10px] text-gray-300 italic">No shotef</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {shotefDays.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[...new Set(shotefDays.map((d) => d.member_name))].map((name) => (
              <span key={name} className="text-xs px-2 py-1 rounded-full font-medium bg-teal-100 text-teal-800">
                {name}
              </span>
            ))}
          </div>
        )}
      </div>

      </div> {/* end dual calendar grid */}

      {/* Swap History */}
      {swappedShifts.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowSwapHistory(!showSwapHistory)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <ArrowLeftRight size={14} />
            Swap History ({swappedShifts.length})
            {showSwapHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showSwapHistory && (
            <div className="mt-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                    <th className="text-left py-2 px-4 font-medium">Date</th>
                    <th className="text-left py-2 px-4 font-medium">Original Member</th>
                    <th className="text-left py-2 px-4 font-medium">Covering Member</th>
                    <th className="text-right py-2 px-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {swappedShifts.map((s) => (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 px-4 text-sm text-gray-900">
                        {dayjs(s.shift_date).format("ddd, MMM D")}
                      </td>
                      <td className="py-2 px-4 text-sm text-gray-700">{s.swap!.original_member_name}</td>
                      <td className="py-2 px-4 text-sm text-gray-700">{s.member_name}</td>
                      <td className="py-2 px-4 text-right">
                        <button
                          onClick={() => handleRevertSwap(s.swap!.id)}
                          className="text-xs text-red-600 hover:text-red-700 font-medium"
                        >
                          Revert
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Unavailability Modal (multi-date) */}
      <Modal
        open={unavMemberId !== null}
        onClose={() => setUnavMemberId(null)}
        title={`Add Unavailability — ${members.find((m) => m.id === unavMemberId)?.name}`}
      >
        {(() => {
          const existingDates = new Set(
            (monthUnavailabilities[unavMemberId ?? 0] ?? []).map((u) => u.date)
          );
          return (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                Click dates to toggle. {unavDates.size > 0 && (
                  <span className="font-semibold text-indigo-600">{unavDates.size} selected</span>
                )}
              </p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-7">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                    <div key={d} className="py-1.5 text-center text-[10px] font-semibold text-gray-400 border-b border-gray-200 bg-gray-50">
                      {d}
                    </div>
                  ))}
                  {cells.map((day, i) => {
                    const dateStr = day?.format("YYYY-MM-DD");
                    const isSelected = dateStr ? unavDates.has(dateStr) : false;
                    const alreadyUnav = dateStr ? existingDates.has(dateStr) : false;
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={!day || alreadyUnav}
                        onClick={() => dateStr && toggleUnavDate(dateStr)}
                        className={`h-9 text-xs font-medium border-b border-r border-gray-100 transition-colors ${
                          !day
                            ? "bg-gray-50/50"
                            : alreadyUnav
                              ? "bg-red-50 text-red-300 cursor-not-allowed"
                              : isSelected
                                ? "bg-indigo-600 text-white"
                                : "hover:bg-indigo-50 text-gray-700"
                        }`}
                        title={alreadyUnav ? "Already unavailable" : undefined}
                      >
                        {day?.date()}
                      </button>
                    );
                  })}
                </div>
              </div>
              {unavDates.size > 0 && (
                <div className="flex flex-wrap gap-1">
                  {[...unavDates].sort().map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-800"
                    >
                      {dayjs(d).format("ddd D")}
                      <button onClick={() => toggleUnavDate(d)} className="hover:text-indigo-500">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional, shared)</label>
                <input
                  value={unavReason}
                  onChange={(e) => setUnavReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="e.g. Vacation, Doctor, Personal"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setUnavMemberId(null)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
                <button
                  onClick={handleAddUnav}
                  disabled={unavDates.size === 0}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Add {unavDates.size > 0 ? `${unavDates.size} ` : ""}Unavailabilit{unavDates.size === 1 ? "y" : "ies"}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Swap Modal */}
      <Modal open={!!swapShiftTarget} onClose={() => setSwapShiftTarget(null)} title="Swap Shift">
        {swapShiftTarget && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-500">Shift</p>
              <p className="text-sm font-medium text-gray-900">
                {dayjs(swapShiftTarget.shift_date).format("dddd, MMMM D, YYYY")}
              </p>
              <p className="text-sm text-gray-700">
                Currently assigned to: <span className="font-medium">{swapShiftTarget.member_name}</span>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Covering Member</label>
              <select
                value={swapMemberId}
                onChange={(e) => setSwapMemberId(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">Select a member...</option>
                {members
                  .filter((m) => m.id !== swapShiftTarget.member_id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
              </select>
            </div>
            <p className="text-xs text-gray-500">
              The covering member will take this shift. The swap is tracked so the scheduler balances it out in future months.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setSwapShiftTarget(null)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleSwap}
                disabled={!swapMemberId || swapping}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <ArrowLeftRight size={14} className="inline mr-1" />
                {swapping ? "Swapping..." : "Confirm Swap"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Suggestions Modal */}
      <Modal open={showSuggestions} onClose={() => setShowSuggestions(false)} title="Scheduling Warnings" wide>
        <div className="space-y-3">
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500" />
            Some days could not be assigned. Here are the details:
          </p>
          {suggestions.map((s) => (
            <div key={s.date} className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-amber-50 p-3">
                <p className="text-sm font-medium text-gray-900">
                  {s.day_of_week}, {s.date}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Unavailable members:</p>
                <ul className="mt-1 space-y-0.5">
                  {s.unavailable_members.map((m) => (
                    <li key={m.member_name} className="text-xs text-gray-600">
                      <span className="font-medium">{m.member_name}</span>: {m.reason || "unavailable"}
                    </li>
                  ))}
                </ul>
              </div>
              {s.optional_members && s.optional_members.length > 0 && (
                <div className="bg-indigo-50 p-3 border-t border-gray-200">
                  <p className="text-xs font-medium text-indigo-700 mb-1">Optional members (by fairness) -- click to assign:</p>
                  <ul className="space-y-1">
                    {s.optional_members.map((m) => {
                      const key = `${s.date}-${m.member_name}`;
                      const isAssigning = assigning === key;
                      return (
                        <li key={m.member_name} className="text-xs text-indigo-900 flex items-center gap-2">
                          <button
                            onClick={() => handleAssign(m.member_name, s.date)}
                            disabled={!!assigning}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 text-[11px] font-medium shrink-0 transition-colors"
                          >
                            <UserPlus size={11} />
                            {isAssigning ? "Assigning..." : "Assign"}
                          </button>
                          <span className="font-medium">{m.member_name}</span>
                          <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 text-[10px]">{m.shift_count} shifts</span>
                          <span className="text-indigo-500 hidden sm:inline">{m.reason}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </Modal>

      {/* Shotef Reassignment Modal */}
      <Modal open={showShotefSubs && shotefSubNeeds.length > 0} onClose={() => setShowShotefSubs(false)} title="Shotef — Reassignment Needed" wide>
        <div className="space-y-3">
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <AlertTriangle size={14} className="text-teal-500" />
            The assigned Shotef member is unavailable on some days. Pick a replacement:
          </p>
          {shotefSubNeeds.map((n) => (
            <div key={n.date} className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-teal-50 p-3">
                <p className="text-sm font-medium text-gray-900">
                  {n.day_of_week}, {n.date}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  <span className="font-medium">{n.member_name}</span> is the assigned Shotef but is unavailable: {n.reason}
                </p>
              </div>
              <div className="bg-indigo-50 p-3 border-t border-gray-200">
                <p className="text-xs font-medium text-indigo-700 mb-1">Available members (by Shotef fairness):</p>
                <ul className="space-y-1">
                  {n.optional_members.map((m) => {
                    const sd = shotefDays.find((d) => d.date === n.date);
                    const key = `${sd?.id ?? 0}-${n.date}-${m.member_id}`;
                    const isThis = assigningShotef === key;
                    return (
                      <li key={m.member_id} className="text-xs text-indigo-900 flex items-center gap-2">
                        <button
                          onClick={() => handleReassignShotefDay(n.date, m.member_id)}
                          disabled={!!assigningShotef}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 text-[11px] font-medium shrink-0 transition-colors"
                        >
                          <UserPlus size={11} />
                          {isThis ? "Assigning..." : "Assign"}
                        </button>
                        <span className="font-medium">{m.member_name}</span>
                        <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 text-[10px]">{m.shotef_count} days</span>
                        {m.is_unavailable && (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-600 text-[10px]">unavailable</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete Schedule"
        message={`Delete all shifts for ${month.format("MMMM YYYY")}?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
