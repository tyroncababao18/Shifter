import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export interface Team {
  id: number;
  name: string;
  picture_url: string | null;
  description: string | null;
  member_count: number;
  created_at: string | null;
}

export interface Member {
  id: number;
  team_id: number;
  name: string;
  sleeps_in_building: boolean;
  is_leader: boolean;
  photo_url: string | null;
  shift_credit: number;
  shotef_credit: number;
  shift_count: number;
  created_at: string | null;
  unavailabilities: Unavailability[];
}

export interface Unavailability {
  id: number;
  member_id: number;
  date: string;
  reason: string;
}

export interface ShiftSwapInfo {
  id: number;
  original_member_id: number;
  original_member_name: string;
  covering_member_id: number;
}

export interface ShiftEntry {
  id: number;
  shift_date: string;
  day_of_week: string;
  member_id: number;
  member_name: string;
  swap?: ShiftSwapInfo;
}

export interface Assignment {
  date: string;
  day_of_week: string;
  member_name: string;
}

export interface Suggestion {
  date: string;
  day_of_week: string;
  unavailable_members: { member_name: string; reason: string }[];
  optional_members: { member_name: string; shift_count: number; reason: string }[];
}

export interface SettingsMap {
  max_normal_shifts: string;
  max_thursday_shifts: string;
  max_weekend_shifts: string;
  justice_lookback_months: string;
  min_days_between_shifts: string;
  shotef_enabled: string;
  shotef_settled_at: string;
}

export interface SwapBalance {
  member_id: number;
  name: string;
  covers_done: number;
  covers_received: number;
  net_balance: number;
}

export interface ShiftSwapRecord {
  id: number;
  shift_id: number;
  original_member_id: number;
  original_member_name: string;
  covering_member_id: number;
  covering_member_name: string;
  created_at: string | null;
}

export interface ReportMember {
  id: number;
  name: string;
  shift_count: number;
  shift_credit: number;
  covers_done: number;
  covers_received: number;
  swap_balance: number;
  shotef_days: number;
}

// Shotef types (day-level)
export interface ShotefDayEntry {
  id: number;
  team_id: number;
  member_id: number;
  member_name: string;
  date: string;
  year: number;
  month: number;
}

export interface ShotefAssignment {
  week_start: string;
  member_name: string;
  member_id: number;
  days: string[];
  unavailable_days: string[];
}

export interface ShotefSubNeed {
  member_name: string;
  date: string;
  day_of_week: string;
  reason: string;
  optional_members: { member_name: string; member_id: number; shotef_count: number; is_unavailable: boolean }[];
}

export interface ShotefHistoryEntry {
  member_id: number;
  name: string;
  is_leader: boolean;
  total_shotef_days: number;
  shotef_credit: number;
  effective_shotef_count: number;
}

export interface ReportTeam {
  team_id: number;
  team_name: string;
  member_count: number;
  total_shifts: number;
  members: ReportMember[];
}

// Teams
export const getTeams = () => api.get<{ teams: Team[]; stats: { total_teams: number; total_members: number; total_shifts: number } }>("/teams");
export const getTeam = (id: number) => api.get<{ team: Team; members: Member[] }>(`/teams/${id}`);
export const createTeam = (data: { name: string; description?: string }) => api.post<Team>("/teams", data);
export const updateTeam = (id: number, data: Partial<Team>) => api.put<Team>(`/teams/${id}`, data);
export const deleteTeam = (id: number) => api.delete(`/teams/${id}`);

// Members
export const getMembers = (teamId: number) => api.get<{ members: Member[] }>(`/teams/${teamId}/members`);
export const createMember = (teamId: number, data: { name: string; sleeps_in_building?: boolean; is_leader?: boolean }) => api.post<Member>(`/teams/${teamId}/members`, data);
export const updateMember = (id: number, data: Partial<Member>) => api.put<Member>(`/members/${id}`, data);
export const deleteMember = (id: number) => api.delete(`/members/${id}`);

// Unavailabilities
export const getUnavailabilities = (memberId: number) => api.get<{ unavailabilities: Unavailability[] }>(`/members/${memberId}/unavailabilities`);
export const createUnavailability = (memberId: number, data: { date: string; reason?: string }) => api.post<Unavailability>(`/members/${memberId}/unavailabilities`, data);
export const bulkCreateUnavailability = (memberId: number, data: { dates: string[]; reason?: string }) =>
  api.post<{ message: string; count: number }>(`/members/${memberId}/unavailabilities/bulk`, data);
export const updateUnavailability = (id: number, data: Partial<Unavailability>) => api.put<Unavailability>(`/unavailabilities/${id}`, data);
export const deleteUnavailability = (id: number) => api.delete(`/unavailabilities/${id}`);

// Schedule
export const generateSchedule = (teamId: number, year: number, month: number) =>
  api.post<{
    assignments: Assignment[];
    suggestions: Suggestion[];
    shotef_assignments: ShotefAssignment[];
    shotef_needs_substitute: ShotefSubNeed[];
  }>(`/teams/${teamId}/schedule/generate`, { year, month });
export const getSchedule = (teamId: number, year: number, month: number) => api.get<{ shifts: ShiftEntry[] }>(`/teams/${teamId}/schedule`, { params: { year, month } });
export const deleteSchedule = (teamId: number, year: number, month: number) => api.delete(`/teams/${teamId}/schedule`, { params: { year, month } });
export const assignShift = (teamId: number, memberName: string, date: string) =>
  api.post<{ message: string; shift_date: string; member_name: string; assigned_dates: string[] }>(`/teams/${teamId}/schedule/assign`, { member_name: memberName, date });
export const getSavedSchedules = (teamId: number) => api.get<{ schedules: { year: number; month: number; shifts: ShiftEntry[] }[] }>(`/teams/${teamId}/schedules`);

// Shift swaps
export const swapShift = (teamId: number, shiftId: number, coveringMemberId: number) =>
  api.post<{ shift: ShiftEntry; swap: ShiftSwapRecord }>(`/teams/${teamId}/schedule/swap`, { shift_id: shiftId, covering_member_id: coveringMemberId });
export const revertSwap = (swapId: number) => api.delete<{ message: string; shift: ShiftEntry | null }>(`/swaps/${swapId}`);
export const getSwapBalance = (teamId: number) => api.get<{ balances: SwapBalance[] }>(`/teams/${teamId}/swap-balance`);

// Past shifts
export const getPastShifts = (teamId: number, year?: number, month?: number) => api.get<{ shifts: Record<string, { member_name: string; member_id: number; shift_id: number; swap?: ShiftSwapRecord }[]> }>(`/teams/${teamId}/past-shifts`, { params: { year, month } });
export const bulkAddPastShifts = (teamId: number, memberId: number, dates: string[]) => api.post(`/teams/${teamId}/past-shifts`, { member_id: memberId, shift_dates: dates });
export const reassignShift = (shiftId: number, memberId: number) => api.put<ShiftEntry>(`/shifts/${shiftId}`, { member_id: memberId });
export const deleteShift = (id: number) => api.delete(`/shifts/${id}`);

// Shotef (day-level)
export const getShotef = (teamId: number, year: number, month: number) =>
  api.get<{ shotef_days: ShotefDayEntry[] }>(`/teams/${teamId}/shotef`, { params: { year, month } });
export const reassignShotefDay = (teamId: number, shotefDayId: number, memberId: number) =>
  api.post<ShotefDayEntry>(`/teams/${teamId}/shotef/reassign`, { shotef_day_id: shotefDayId, member_id: memberId });
export const deleteShotefDay = (sdId: number) => api.delete<{ message: string }>(`/shotef-days/${sdId}`);
export const getShotefHistory = (teamId: number) =>
  api.get<{ history: ShotefHistoryEntry[]; settled_at: string | null }>(`/teams/${teamId}/shotef-history`);
export const settleShotef = (teamId: number) =>
  api.post<{ message: string; settled_at: string }>(`/teams/${teamId}/shotef-settle`);
export const addShotefDays = (teamId: number, memberId: number, dates: string[]) =>
  api.post<{ message: string; count: number }>(`/teams/${teamId}/shotef-days`, { member_id: memberId, dates });

// Combined view endpoints (performance)
export const getScheduleView = (teamId: number, year: number, month: number) =>
  api.get<{ team: Team; members: Member[]; shifts: ShiftEntry[]; shotef_days: ShotefDayEntry[] }>(
    `/teams/${teamId}/schedule-view`, { params: { year, month } }
  );
export const getPastShiftsView = (teamId: number, year: number, month: number) =>
  api.get<{
    team: Team;
    members: Member[];
    shifts: Record<string, { member_name: string; member_id: number; shift_id: number; swap?: ShiftSwapRecord }[]>;
    shotef_days: ShotefDayEntry[];
  }>(`/teams/${teamId}/past-shifts-view`, { params: { year, month } });

// Settings
export const getSettings = (teamId?: number) => api.get<{ settings: SettingsMap; defaults: SettingsMap }>("/settings", { params: teamId ? { team_id: teamId } : {} });
export const updateSettings = (settings: Partial<SettingsMap>, teamId?: number) => api.put<{ settings: SettingsMap }>("/settings", { settings, team_id: teamId ?? null });

// Reports
export const getReports = () => api.get<{ teams: ReportTeam[]; stats: { total_teams: number; total_members: number; total_shifts: number } }>("/reports");
