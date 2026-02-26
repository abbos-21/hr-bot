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
import { PlaygroundPage } from "./pages/Playground";
import { useWebSocket } from "./hooks/useWebSocket";

// Shown while the startup /me check is in flight so we never flash the
// login screen or redirect prematurely on a simple page refresh.
const InitializingScreen: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Loading…</p>
    </div>
  </div>
);

const ProtectedLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { admin, initializing } = useAuthStore();

  useWebSocket({});

  // Still waiting for the /me response — don't redirect yet.
  if (initializing) return <InitializingScreen />;

  if (!admin) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
};

function App() {
  const { token, fetchMe, admin, initializing } = useAuthStore();

  useEffect(() => {
    // Only run the startup check once: when we have a stored token but no
    // admin object yet.  The in-flight guard inside fetchMe ensures this
    // never fires a second HTTP request even if the effect runs twice.
    if (token && !admin && initializing) {
      fetchMe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← empty deps: run exactly once on mount, not on every re-render

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
          path="/playground"
          element={
            <ProtectedLayout>
              <PlaygroundPage />
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
