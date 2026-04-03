import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import axios from "axios";

export interface UserOrg {
  id: number;
  name: string;
  org_role: string;
}

export interface UserTeam {
  id: number;
  name: string;
  organization_id: number | null;
  team_role: string;
}

export interface AuthUser {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  must_change_password: boolean;
  platform_role: string;
  organizations: UserOrg[];
  teams: UserTeam[];
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  updateUser: (user: AuthUser) => void;
  isShifterAdmin: boolean;
  isOrgAdmin: (orgId: number) => boolean;
  isTeamAdmin: (teamId: number) => boolean;
  selectedOrgId: number | null;
  setSelectedOrgId: (id: number | null) => void;
  availableOrgs: UserOrg[];
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("shifter_token"));
  const [isLoading, setIsLoading] = useState(true);
  const [allOrgs, setAllOrgs] = useState<UserOrg[]>([]);
  const [selectedOrgId, setSelectedOrgIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem("shifter_selected_org");
    return stored ? parseInt(stored) : null;
  });

  const setSelectedOrgId = useCallback((id: number | null) => {
    setSelectedOrgIdState(id);
    if (id !== null) {
      localStorage.setItem("shifter_selected_org", String(id));
    } else {
      localStorage.removeItem("shifter_selected_org");
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("shifter_token");
    localStorage.removeItem("shifter_selected_org");
    setToken(null);
    setUser(null);
    setAllOrgs([]);
    setSelectedOrgIdState(null);
  }, []);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    axios
      .get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setUser(res.data.user);
        // For shifter admins, also fetch all orgs
        if (res.data.user.platform_role === "shifter_admin") {
          axios
            .get("/api/admin/organizations", { headers: { Authorization: `Bearer ${token}` } })
            .then((orgRes) => {
              setAllOrgs(orgRes.data.organizations.map((o: any) => ({ id: o.id, name: o.name, org_role: "shifter_admin" })));
            })
            .catch(() => {});
        }
      })
      .catch(() => logout())
      .finally(() => setIsLoading(false));
  }, [token, logout]);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const res = await axios.post("/api/auth/login", { email, password });
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem("shifter_token", newToken);
    setToken(newToken);
    setUser(userData);
    // Fetch orgs for shifter admin
    if (userData.platform_role === "shifter_admin") {
      try {
        const orgRes = await axios.get("/api/admin/organizations", { headers: { Authorization: `Bearer ${newToken}` } });
        setAllOrgs(orgRes.data.organizations.map((o: any) => ({ id: o.id, name: o.name, org_role: "shifter_admin" })));
      } catch { /* ok */ }
    }
    return userData;
  };

  const updateUser = (u: AuthUser) => setUser(u);

  const isShifterAdmin = user?.platform_role === "shifter_admin";

  // For shifter admin: use allOrgs (all platform orgs). For others: user's own orgs.
  const availableOrgs: UserOrg[] = isShifterAdmin ? allOrgs : (user?.organizations ?? []);

  const isOrgAdmin = (orgId: number) =>
    isShifterAdmin || (user?.organizations.some((o) => o.id === orgId && o.org_role === "organization_admin") ?? false);

  const isTeamAdmin = (teamId: number) => {
    if (isShifterAdmin) return true;
    if (user?.teams.some((t) => t.id === teamId && t.team_role === "team_admin")) return true;
    // Org admins are also team admins for teams in their org
    const team = user?.teams.find((t) => t.id === teamId);
    if (team?.organization_id && isOrgAdmin(team.organization_id)) return true;
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        updateUser,
        isShifterAdmin,
        isOrgAdmin,
        isTeamAdmin,
        selectedOrgId,
        setSelectedOrgId,
        availableOrgs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
