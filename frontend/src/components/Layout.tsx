import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Settings,
  BarChart3,
  BookOpen,
  Dices,
  CalendarClock,
  Menu,
  X,
  Building2,
  Users,
  LogOut,
  ChevronsUpDown,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, isShifterAdmin, selectedOrgId, setSelectedOrgId, availableOrgs } = useAuth();
  const showOrgSelector = availableOrgs.length > 1 || isShifterAdmin;

  const showAdminNav = isShifterAdmin || (user?.organizations.some((o) => o.org_role === "organization_admin") ?? false);

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard", show: true },
    { to: "/settings", icon: Settings, label: "Settings", show: true },
    { to: "/reports", icon: BarChart3, label: "Reports", show: true },
    { to: "/picker", icon: Dices, label: "Random Picker", show: true },
    { to: "/docs", icon: BookOpen, label: "Documentation", show: true },
  ];

  const adminItems = [
    { to: "/admin/organizations", icon: Building2, label: "Organizations", show: isShifterAdmin },
    { to: "/admin/users", icon: Users, label: "Users", show: showAdminNav },
  ];

  const displayName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email
    : "";

  const roleBadge = isShifterAdmin
    ? "Platform Admin"
    : user?.organizations.some((o) => o.org_role === "organization_admin")
    ? "Org Admin"
    : user?.teams.some((t) => t.team_role === "team_admin")
    ? "Team Admin"
    : "Employee";

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white
          transform transition-transform duration-200 lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } flex flex-col`}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          <div className="w-9 h-9 rounded-lg bg-indigo-500 flex items-center justify-center">
            <CalendarClock size={20} />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Shifter
          </span>
        </div>

        <nav className="mt-6 px-3 space-y-1 flex-1 overflow-y-auto">
          {navItems
            .filter((item) => item.show)
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}

          {adminItems.some((i) => i.show) && (
            <>
              <div className="pt-4 pb-2 px-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Admin
                </span>
              </div>
              {adminItems
                .filter((item) => item.show)
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-white/15 text-white"
                          : "text-slate-300 hover:bg-white/10 hover:text-white"
                      }`
                    }
                  >
                    <item.icon size={18} />
                    {item.label}
                  </NavLink>
                ))}
            </>
          )}
        </nav>

        {/* User section at bottom */}
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300">
              {(user?.first_name?.[0] || user?.email?.[0] || "?").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{displayName}</p>
              <p className="text-xs text-slate-400">{roleBadge}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-gray-200 bg-white flex items-center px-4 lg:px-6 shrink-0">
          <button
            className="lg:hidden p-1.5 rounded-md hover:bg-gray-100 mr-3"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <h1 className="text-sm font-medium text-gray-500">
            Shift Management
          </h1>

          {showOrgSelector && (
            <div className="ml-auto flex items-center gap-2">
              <Building2 size={14} className="text-gray-400" />
              <select
                value={selectedOrgId ?? ""}
                onChange={(e) => setSelectedOrgId(e.target.value ? parseInt(e.target.value) : null)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-w-[180px]"
              >
                <option value="">All Organizations</option>
                {availableOrgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <ChevronsUpDown size={14} className="text-gray-300 -ml-7 pointer-events-none" />
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
          <footer className="mt-12 pb-4 text-center text-xs text-gray-400">
            This site was built by love to all managers out there, by Tamir Manasherov
          </footer>
        </main>
      </div>
    </div>
  );
}
