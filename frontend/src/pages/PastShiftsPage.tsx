import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import {
  getPastShiftsView, bulkAddPastShifts, deleteShift,
  addShotefDays, deleteShotefDay,
  type Team, type Member, type ShotefDayEntry,
} from "../api";
import Modal from "../components/Modal";

const SHIFT_COLORS = [
  "bg-indigo-100 text-indigo-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-teal-100 text-teal-800",
  "bg-orange-100 text-orange-800",
];

type ShiftInfo = { member_name: string; member_id: number; shift_id: number };

export default function PastShiftsPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const id = Number(teamId);

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [month, setMonth] = useState(dayjs().subtract(1, "month").startOf("month"));
  const [shifts, setShifts] = useState<Record<string, ShiftInfo[]>>({});
  const [loading, setLoading] = useState(true);

  // Past shifts modal
  const [showAdd, setShowAdd] = useState(false);
  const [addMemberId, setAddMemberId] = useState<number | "">("");
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());

  // Shotef state
  const [shotefDays, setShotefDays] = useState<ShotefDayEntry[]>([]);
  const [showAddShotef, setShowAddShotef] = useState(false);
  const [shotefMemberId, setShotefMemberId] = useState<number | "">("");
  const [selectedShotefDates, setSelectedShotefDates] = useState<Set<string>>(new Set());


  const load = async () => {
    try {
      const { data } = await getPastShiftsView(id, month.year(), month.month() + 1);
      setTeam(data.team);
      setMembers(data.members);
      setShifts(data.shifts);
      setShotefDays(data.shotef_days);
    } catch {
      toast.error("Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); load(); }, [id, month]);

  const memberColorMap = useMemo(() => {
    const names = [...new Set(Object.values(shifts).flat().map((s) => s.member_name))];
    const map: Record<string, string> = {};
    names.forEach((n, i) => { map[n] = SHIFT_COLORS[i % SHIFT_COLORS.length]; });
    return map;
  }, [shifts]);

  const shotefByDate = useMemo(() => {
    const map: Record<string, { memberName: string; shotefDayId: number }> = {};
    for (const sd of shotefDays) {
      map[sd.date] = { memberName: sd.member_name, shotefDayId: sd.id };
    }
    return map;
  }, [shotefDays]);

  // Calendar grid
  const firstDay = month.startOf("month");
  const daysInMonth = month.daysInMonth();
  const startPad = firstDay.day();
  const cells: (dayjs.Dayjs | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(month.date(d));

  const existingShiftDates = useMemo(() => {
    const s = new Set<string>();
    for (const [date, arr] of Object.entries(shifts)) {
      if (arr.length > 0) s.add(date);
    }
    return s;
  }, [shifts]);

  const toggleDate = (dateStr: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  const usedShotefDates = useMemo(
    () => new Set(shotefDays.map((d) => d.date)),
    [shotefDays],
  );

  const toggleShotefDate = (dateStr: string) => {
    setSelectedShotefDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!addMemberId || selectedDates.size === 0) { toast.error("Select member and at least one date"); return; }
    const dates = [...selectedDates].sort();
    try {
      const { data } = await bulkAddPastShifts(id, Number(addMemberId), dates);
      toast.success(data.message);
      setShowAdd(false);
      setSelectedDates(new Set());
      setAddMemberId("");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to add");
    }
  };

  const handleDeleteShift = async (shiftId: number) => {
    try {
      await deleteShift(shiftId);
      toast.success("Shift removed");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleAddShotef = async () => {
    if (!shotefMemberId || selectedShotefDates.size === 0) { toast.error("Select member and at least one date"); return; }
    try {
      const { data } = await addShotefDays(id, Number(shotefMemberId), [...selectedShotefDates].sort());
      toast.success(data.message);
      setShowAddShotef(false);
      setSelectedShotefDates(new Set());
      setShotefMemberId("");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to add");
    }
  };

  const handleDeleteShotef = async (sdId: number) => {
    try {
      await deleteShotefDay(sdId);
      toast.success("Shotef day removed");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  if (loading && !team) return <div className="h-96 bg-gray-100 rounded-xl animate-pulse" />;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/" className="hover:text-gray-700">Dashboard</Link>
        <span>/</span>
        <Link to={`/teams/${id}`} className="hover:text-gray-700">{team?.name}</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Past Shifts</span>
      </div>

      {/* Month nav */}
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
        <div className="flex gap-2">
          <button
            onClick={() => { setShowAdd(true); setSelectedDates(new Set()); setAddMemberId(""); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus size={14} /> Add Shifts
          </button>
          <button
            onClick={() => { setShowAddShotef(true); setSelectedShotefDates(new Set()); setShotefMemberId(""); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700"
          >
            <Plus size={14} /> Add Shotef
          </button>
        </div>
      </div>

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
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 border-b border-gray-200 bg-gray-50">{d}</div>
              ))}
              {cells.map((day, i) => {
                const dateStr = day?.format("YYYY-MM-DD");
                const dayShifts = dateStr ? shifts[dateStr] || [] : [];
                const isWeekend = day && (day.day() === 5 || day.day() === 6);
                return (
                  <div key={i} className={`min-h-[80px] p-1.5 border-b border-r border-gray-100 ${!day ? "bg-gray-50/50" : isWeekend ? "bg-amber-50/30" : ""}`}>
                    {day && (
                      <>
                        <div className="text-xs font-medium text-gray-500 mb-1">{day.date()}</div>
                        {dayShifts.map((s) => (
                          <div key={s.shift_id} className={`text-xs px-1.5 py-0.5 rounded mb-0.5 truncate font-medium flex items-center justify-between group ${memberColorMap[s.member_name] || "bg-gray-100 text-gray-700"}`}>
                            <span className="truncate">{s.member_name}</span>
                            <button onClick={() => handleDeleteShift(s.shift_id)} className="opacity-0 group-hover:opacity-100 ml-1 shrink-0"><Trash2 size={10} /></button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {Object.keys(memberColorMap).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(memberColorMap).map(([name, color]) => (
                <span key={name} className={`text-xs px-2 py-1 rounded-full font-medium ${color}`}>{name}</span>
              ))}
            </div>
          )}
        </div>

        {/* Shotef Calendar */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-500" />
            Shotef (Day Duty)
            {shotefDays.length === 0 && <span className="text-xs text-gray-400 font-normal">&mdash; No data for this month</span>}
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-7">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 border-b border-gray-200 bg-gray-50">{d}</div>
              ))}
              {cells.map((day, i) => {
                const dateStr = day?.format("YYYY-MM-DD");
                const dayNum = day?.day();
                const isWeekend = day && (dayNum === 5 || dayNum === 6);
                const isShotefDay = day && dayNum !== undefined && dayNum >= 0 && dayNum <= 4;
                const info = dateStr ? shotefByDate[dateStr] : undefined;
                return (
                  <div key={i} className={`min-h-[80px] p-1.5 border-b border-r border-gray-100 ${!day ? "bg-gray-50/50" : isWeekend ? "bg-gray-100/60" : ""}`}>
                    {day && (
                      <>
                        <div className="text-xs font-medium text-gray-500 mb-1">{day.date()}</div>
                        {isShotefDay && info && (
                          <div className="text-xs px-1.5 py-0.5 rounded mb-0.5 font-medium truncate bg-teal-100 text-teal-800 group flex items-center gap-1">
                            <span className="truncate flex-1">{info.memberName}</span>
                            <button onClick={() => handleDeleteShotef(info.shotefDayId)} className="opacity-0 group-hover:opacity-100 shrink-0 text-red-400 hover:text-red-600" title="Remove">
                              <Trash2 size={10} />
                            </button>
                          </div>
                        )}
                        {isShotefDay && !info && shotefDays.length > 0 && <div className="text-[10px] text-gray-300 italic">—</div>}
                        {isWeekend && <div className="text-[10px] text-gray-300 italic">No shotef</div>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Add Past Shifts Modal (multi-date calendar) ── */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Past Shifts">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Member</label>
            <select
              value={addMemberId}
              onChange={(e) => setAddMemberId(Number(e.target.value) || "")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="">Select member...</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-500">
            Click dates to toggle.
            {selectedDates.size > 0 && (
              <span className="font-semibold text-indigo-600 ml-1">{selectedDates.size} selected</span>
            )}
          </p>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-7">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="py-1.5 text-center text-[10px] font-semibold text-gray-400 border-b border-gray-200 bg-gray-50">{d}</div>
              ))}
              {cells.map((day, i) => {
                const dateStr = day?.format("YYYY-MM-DD");
                const alreadyHasShift = dateStr ? existingShiftDates.has(dateStr) : false;
                const isSelected = dateStr ? selectedDates.has(dateStr) : false;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!day}
                    onClick={() => dateStr && day && toggleDate(dateStr)}
                    className={`h-9 text-xs font-medium border-b border-r border-gray-100 transition-colors ${
                      !day
                        ? "bg-gray-50/50"
                        : isSelected
                          ? "bg-indigo-600 text-white"
                          : alreadyHasShift
                            ? "bg-indigo-50 text-indigo-400 hover:bg-indigo-100"
                            : "hover:bg-indigo-50 text-gray-700"
                    }`}
                    title={alreadyHasShift ? "Already has a shift (click to add another)" : undefined}
                  >
                    {day?.date()}
                  </button>
                );
              })}
            </div>
          </div>
          {selectedDates.size > 0 && (
            <div className="flex flex-wrap gap-1">
              {[...selectedDates].sort().map((d) => (
                <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-800">
                  {dayjs(d).format("ddd D")}
                  <button onClick={() => toggleDate(d)} className="hover:text-indigo-500"><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={!addMemberId || selectedDates.size === 0}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Add {selectedDates.size > 0 ? `${selectedDates.size} ` : ""}Shift{selectedDates.size !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Add Past Shotef Modal (multi-week calendar) ── */}
      <Modal open={showAddShotef} onClose={() => setShowAddShotef(false)} title="Add Past Shotef Weeks">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Member</label>
            <select
              value={shotefMemberId}
              onChange={(e) => setShotefMemberId(Number(e.target.value) || "")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
            >
              <option value="">Select member...</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-500">
            Click work days (Sun-Thu) to select them individually. Fri/Sat are off. Split weeks between members by selecting dates per member.
            {selectedShotefDates.size > 0 && (
              <span className="font-semibold text-teal-600 ml-1">{selectedShotefDates.size} day{selectedShotefDates.size !== 1 ? "s" : ""} selected</span>
            )}
          </p>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-7">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="py-1.5 text-center text-[10px] font-semibold text-gray-400 border-b border-gray-200 bg-gray-50">{d}</div>
              ))}
              {cells.map((day, i) => {
                const dateStr = day?.format("YYYY-MM-DD");
                const dayNum = day?.day();
                const isWeekend = day && (dayNum === 5 || dayNum === 6);
                const isShotefDay = day && dayNum !== undefined && dayNum >= 0 && dayNum <= 4;
                const alreadyUsed = dateStr ? usedShotefDates.has(dateStr) : false;
                const isSelected = dateStr ? selectedShotefDates.has(dateStr) : false;
                const disabled = !day || isWeekend || !isShotefDay || alreadyUsed;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => dateStr && !disabled && toggleShotefDate(dateStr)}
                    className={`h-9 text-xs font-medium border-b border-r border-gray-100 transition-colors ${
                      !day
                        ? "bg-gray-50/50"
                        : isWeekend
                          ? "bg-gray-100/60 text-gray-300 cursor-not-allowed"
                          : alreadyUsed
                            ? "bg-teal-50 text-teal-300 cursor-not-allowed"
                            : isSelected
                              ? "bg-teal-600 text-white"
                              : "hover:bg-teal-50 text-gray-700"
                    }`}
                    title={alreadyUsed ? "Already assigned" : isWeekend ? "No shotef on weekends" : undefined}
                  >
                    {day?.date()}
                  </button>
                );
              })}
            </div>
          </div>
          {selectedShotefDates.size > 0 && (
            <div className="flex flex-wrap gap-1">
              {[...selectedShotefDates].sort().map((d) => (
                <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-teal-100 text-teal-800">
                  {dayjs(d).format("ddd D")}
                  <button onClick={() => toggleShotefDate(d)} className="hover:text-teal-500"><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowAddShotef(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
            <button
              onClick={handleAddShotef}
              disabled={!shotefMemberId || selectedShotefDates.size === 0}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
            >
              Add {selectedShotefDates.size > 0 ? `${selectedShotefDates.size} ` : ""}Day{selectedShotefDates.size !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
