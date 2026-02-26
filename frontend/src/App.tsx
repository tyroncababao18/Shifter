import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import TeamDetail from "./pages/TeamDetail";
import SchedulePage from "./pages/SchedulePage";
import PastShiftsPage from "./pages/PastShiftsPage";
import AdminSettings from "./pages/AdminSettings";
import ReportsPage from "./pages/ReportsPage";
import DocsPage from "./pages/DocsPage";
import PickerPage from "./pages/PickerPage";

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/teams/:teamId" element={<TeamDetail />} />
          <Route path="/teams/:teamId/schedule" element={<SchedulePage />} />
          <Route path="/teams/:teamId/past-shifts" element={<PastShiftsPage />} />
          <Route path="/settings" element={<AdminSettings />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/picker" element={<PickerPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
