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
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/picker", icon: Dices, label: "Random Picker" },
  { to: "/docs", icon: BookOpen, label: "Documentation" },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          }`}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          <div className="w-9 h-9 rounded-lg bg-indigo-500 flex items-center justify-center">
            <CalendarClock size={20} />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Shifter
          </span>
        </div>

        <nav className="mt-6 px-3 space-y-1">
          {navItems.map((item) => (
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
        </nav>
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
