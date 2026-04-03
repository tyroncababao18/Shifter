import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import ForcePasswordChangePage from "./pages/ForcePasswordChangePage";
import Dashboard from "./pages/Dashboard";
import TeamDetail from "./pages/TeamDetail";
import SchedulePage from "./pages/SchedulePage";
import PastShiftsPage from "./pages/PastShiftsPage";
import AdminSettings from "./pages/AdminSettings";
import ReportsPage from "./pages/ReportsPage";
import DocsPage from "./pages/DocsPage";
import PickerPage from "./pages/PickerPage";
import OrganizationsPage from "./pages/admin/OrganizationsPage";
import OrgDetailPage from "./pages/admin/OrgDetailPage";
import UsersPage from "./pages/admin/UsersPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/change-password" element={<ForcePasswordChangePage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/teams/:teamId" element={<TeamDetail />} />
              <Route path="/teams/:teamId/schedule" element={<SchedulePage />} />
              <Route path="/teams/:teamId/past-shifts" element={<PastShiftsPage />} />
              <Route path="/settings" element={<AdminSettings />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="/picker" element={<PickerPage />} />
              {/* Admin routes */}
              <Route path="/admin/organizations" element={<OrganizationsPage />} />
              <Route path="/admin/organizations/:orgId" element={<OrgDetailPage />} />
              <Route path="/admin/users" element={<UsersPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
