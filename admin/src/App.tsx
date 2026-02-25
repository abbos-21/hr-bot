import React, { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "./store/auth";
import { Sidebar } from "./components/Sidebar";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { BotsPage } from "./pages/Bots";
import { BotDetailPage } from "./pages/BotDetail";
import { JobsPage } from "./pages/Jobs";
import { JobDetailPage } from "./pages/JobDetail";
import { CandidatesPage } from "./pages/Candidates";
import { CandidateDetailPage } from "./pages/CandidateDetail";
import { AnalyticsPage } from "./pages/Analytics";
import { AdminsPage } from "./pages/Admins";
import { useWebSocket } from "./hooks/useWebSocket";

const ProtectedLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { admin } = useAuthStore();
  const location = useLocation();

  useWebSocket({});

  if (!admin) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
};

function App() {
  const { token, fetchMe, admin } = useAuthStore();

  useEffect(() => {
    if (token && !admin) {
      fetchMe();
    }
  }, [token]);

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { borderRadius: "10px", background: "#1f2937", color: "#fff" },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedLayout>
              <DashboardPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/bots"
          element={
            <ProtectedLayout>
              <BotsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/bots/:id"
          element={
            <ProtectedLayout>
              <BotDetailPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/jobs"
          element={
            <ProtectedLayout>
              <JobsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/jobs/:id"
          element={
            <ProtectedLayout>
              <JobDetailPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/candidates"
          element={
            <ProtectedLayout>
              <CandidatesPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/candidates/:id"
          element={
            <ProtectedLayout>
              <CandidateDetailPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedLayout>
              <AnalyticsPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/admins"
          element={
            <ProtectedLayout>
              <AdminsPage />
            </ProtectedLayout>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
