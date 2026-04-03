import axios from "axios";

const api = axios.create({ baseURL: "/api" });

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("shifter_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear auth and redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes("/auth/")) {
      localStorage.removeItem("shifter_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

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
  day_shift_credit: number;
  shift_weight: number;
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
  fairness_mode: string;
  min_shifts_per_month: string;
  enable_rebalancing: string;
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
  day_shift_days: number;
}

// Day Shift types (day-level)
export interface DayShiftEntry {
  id: number;
  team_id: number;
  member_id: number;
  member_name: string;
  date: string;
  year: number;
  month: number;
}

export interface DayShiftAssignment {
  week_start: string;
  member_name: string;
  member_id: number;
  days: string[];
  unavailable_days: string[];
}

export interface DayShiftSubNeed {
  member_name: string;
  date: string;
  day_of_week: string;
  reason: string;
  optional_members: { member_name: string; member_id: number; day_shift_count: number; is_unavailable: boolean }[];
}

export interface DayShiftHistoryEntry {
  member_id: number;
  name: string;
  is_leader: boolean;
  total_day_shift_days: number;
  day_shift_credit: number;
  effective_day_shift_count: number;
}

export interface ReportTeam {
  team_id: number;
  team_name: string;
  member_count: number;
  total_shifts: number;
  members: ReportMember[];
}

// Teams
export const getTeams = (orgId?: number | null) =>
  api.get<{ teams: Team[]; stats: { total_teams: number; total_members: number; total_shifts: number } }>(
    "/teams", { params: orgId ? { organization_id: orgId } : {} }
  );
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
    day_shift_assignments: DayShiftAssignment[];
    day_shift_needs_substitute: DayShiftSubNeed[];
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

// Day Shifts (day-level)
export const getDayShifts = (teamId: number, year: number, month: number) =>
  api.get<{ day_shift_days: DayShiftEntry[] }>(`/teams/${teamId}/day-shifts`, { params: { year, month } });
export const reassignDayShift = (teamId: number, dayShiftDayId: number, memberId: number) =>
  api.post<DayShiftEntry>(`/teams/${teamId}/day-shifts/reassign`, { day_shift_day_id: dayShiftDayId, member_id: memberId });
export const deleteDayShift = (sdId: number) => api.delete<{ message: string }>(`/day-shift-days/${sdId}`);
export const getDayShiftHistory = (teamId: number) =>
  api.get<{ history: DayShiftHistoryEntry[]; settled_at: string | null }>(`/teams/${teamId}/day-shift-history`);
export const settleDayShifts = (teamId: number) =>
  api.post<{ message: string; settled_at: string }>(`/teams/${teamId}/day-shift-settle`);
export const addDayShiftDays = (teamId: number, memberId: number, dates: string[]) =>
  api.post<{ message: string; count: number }>(`/teams/${teamId}/day-shift-days`, { member_id: memberId, dates });

// Combined view endpoints (performance)
export const getScheduleView = (teamId: number, year: number, month: number) =>
  api.get<{ team: Team; members: Member[]; shifts: ShiftEntry[]; day_shift_days: DayShiftEntry[] }>(
    `/teams/${teamId}/schedule-view`, { params: { year, month } }
  );
export const getPastShiftsView = (teamId: number, year: number, month: number) =>
  api.get<{
    team: Team;
    members: Member[];
    shifts: Record<string, { member_name: string; member_id: number; shift_id: number; swap?: ShiftSwapRecord }[]>;
    day_shift_days: DayShiftEntry[];
  }>(`/teams/${teamId}/past-shifts-view`, { params: { year, month } });

// Settings
export const getSettings = (teamId?: number) => api.get<{ settings: SettingsMap; defaults: SettingsMap }>("/settings", { params: teamId ? { team_id: teamId } : {} });
export const updateSettings = (settings: Partial<SettingsMap>, teamId?: number) => api.put<{ settings: SettingsMap }>("/settings", { settings, team_id: teamId ?? null });

// Reports
export const getReports = (orgId?: number | null) =>
  api.get<{ teams: ReportTeam[]; stats: { total_teams: number; total_members: number; total_shifts: number } }>(
    "/reports", { params: orgId ? { organization_id: orgId } : {} }
  );

// ── Auth & Admin types ──

export interface AuthUser {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  must_change_password: boolean;
  platform_role: string;
  organizations: { id: number; name: string; org_role: string }[];
  teams: { id: number; name: string; organization_id: number | null; team_role: string }[];
}

export interface OrganizationData {
  id: number;
  name: string;
  created_at: string | null;
  updated_at: string | null;
  member_count?: number;
  team_count?: number;
}

export interface OrgMemberData {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  platform_role: string;
  org_role: string;
  membership_id: number;
}

export interface TeamMemberData {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  platform_role: string;
  team_role: string;
  membership_id: number;
}

// Auth
export const authLogin = (email: string, password: string) =>
  api.post<{ token: string; user: AuthUser }>("/auth/login", { email, password });
export const authMe = () => api.get<{ user: AuthUser }>("/auth/me");
export const authChangePassword = (current_password: string, new_password: string) =>
  api.put<{ message: string; user: AuthUser }>("/auth/password", { current_password, new_password });
export const authForcePasswordChange = (new_password: string) =>
  api.put<{ message: string; user: AuthUser }>("/auth/force-password-change", { new_password });

// Admin — Organizations
export const getOrganizations = () => api.get<{ organizations: OrganizationData[] }>("/admin/organizations");
export const createOrganization = (name: string) => api.post<OrganizationData>("/admin/organizations", { name });
export const getOrganization = (id: number) =>
  api.get<{ organization: OrganizationData; teams: Team[]; members: OrgMemberData[] }>(`/admin/organizations/${id}`);
export const updateOrganization = (id: number, name: string) => api.put<OrganizationData>(`/admin/organizations/${id}`, { name });
export const deleteOrganization = (id: number) => api.delete(`/admin/organizations/${id}`);

// Admin — Org members
export const addOrgMember = (orgId: number, userId: number, orgRole: string) =>
  api.post(`/admin/organizations/${orgId}/members`, { user_id: userId, org_role: orgRole });
export const updateOrgMember = (orgId: number, userId: number, orgRole: string) =>
  api.put(`/admin/organizations/${orgId}/members/${userId}`, { org_role: orgRole });
export const removeOrgMember = (orgId: number, userId: number) =>
  api.delete(`/admin/organizations/${orgId}/members/${userId}`);

// Admin — Users
export const getUsers = () => api.get<{ users: AuthUser[] }>("/admin/users");
export const createUser = (data: {
  email: string; password: string; first_name?: string; last_name?: string;
  platform_role?: string; organization_id?: number; team_id?: number;
  org_role?: string; team_role?: string; must_change_password?: boolean;
}) => api.post<AuthUser>("/admin/users", data);
export const getUser = (id: number) => api.get<{ user: AuthUser }>(`/admin/users/${id}`);
export const updateUserAdmin = (id: number, data: Partial<AuthUser>) => api.put<AuthUser>(`/admin/users/${id}`, data);
export const deleteUser = (id: number) => api.delete(`/admin/users/${id}`);
export const resetUserPassword = (id: number, newPassword: string) =>
  api.put(`/admin/users/${id}/reset-password`, { new_password: newPassword });

// Admin — Team user memberships
export const getTeamUsers = (teamId: number) =>
  api.get<{ members: TeamMemberData[] }>(`/admin/teams/${teamId}/members`);
export const addTeamUser = (teamId: number, userId: number, teamRole: string) =>
  api.post(`/admin/teams/${teamId}/members`, { user_id: userId, team_role: teamRole });
export const updateTeamUser = (teamId: number, userId: number, teamRole: string) =>
  api.put(`/admin/teams/${teamId}/members/${userId}`, { team_role: teamRole });
export const removeTeamUser = (teamId: number, userId: number) =>
  api.delete(`/admin/teams/${teamId}/members/${userId}`);
