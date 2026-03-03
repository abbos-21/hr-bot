import React, { useCallback, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { messagesApi } from "../api";
import { useWebSocket } from "../hooks/useWebSocket";

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: "📊" },
  { label: "Bots", path: "/bots", icon: "🤖" },
  { label: "Playground", path: "/playground", icon: "🧩" },
  { label: "Chats", path: "/chats", icon: "💬" },
  { label: "Pipeline", path: "/candidates", icon: "👥" },
  { label: "Hired", path: "/hired", icon: "✅" },
  { label: "Archived", path: "/past-candidates", icon: "🗃" },
  { label: "Archived Columns", path: "/retired-stages", icon: "📦" },
  { label: "Analytics", path: "/analytics", icon: "📈" },
  { label: "Admins", path: "/admins", icon: "⚙️" },
];

const DIVIDER_BEFORE = "/analytics";

export const Sidebar: React.FC = () => {
  const { admin, logout } = useAuthStore();
  const navigate = useNavigate();
  const [totalUnread, setTotalUnread] = useState(0);

  const refreshUnread = useCallback(() => {
    messagesApi
      .conversations()
      .then((convs: any[]) => {
        setTotalUnread(convs.reduce((sum, c) => sum + (c.unreadCount || 0), 0));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  useWebSocket({
    NEW_MESSAGE: (payload) => {
      if (payload?.message?.direction === "inbound") refreshUnread();
    },
    MESSAGES_READ: refreshUnread,
  });

  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
      <div className="p-5 border-b border-gray-700">
        <h1 className="text-lg font-bold">🎯 HR Recruitment</h1>
        <p className="text-xs text-gray-400 mt-1">Admin Panel</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <React.Fragment key={item.path}>
            {item.path === DIVIDER_BEFORE && (
              <div className="my-2 border-t border-gray-700" />
            )}
            <NavLink
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              <span>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.path === "/chats" && totalUnread > 0 && (
                <span className="min-w-[20px] h-5 bg-blue-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center px-1.5">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </NavLink>
          </React.Fragment>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold">
            {admin?.name?.[0]?.toUpperCase() || "A"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{admin?.name}</p>
            <p className="text-xs text-gray-400 truncate">{admin?.role}</p>
          </div>
        </div>
        <button
          onClick={() => {
            useAuthStore.getState().logout();
            navigate("/login");
          }}
          className="w-full text-left text-sm text-gray-400 hover:text-white transition-colors px-2 py-1"
        >
          🚪 Sign out
        </button>
      </div>
    </aside>
  );
};
