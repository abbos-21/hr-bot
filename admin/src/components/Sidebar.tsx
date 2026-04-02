import React, { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { messagesApi } from "../api";
import { useWebSocket } from "../hooks/useWebSocket";
import { useT, LANGUAGES } from "../i18n";

export const Sidebar: React.FC = () => {
  const { admin, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang, setLang } = useT();
  const [totalUnread, setTotalUnread] = useState(0);
  const [langOpen, setLangOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  const isOrg = admin?.type === "organization";
  const isSuperAdmin = admin?.role === "super_admin";

  const allNavItems = [
    { label: t("nav.dashboard"), path: "/", icon: "📊" },
    { label: t("nav.bots"), path: "/bots", icon: "🤖" },
    { label: t("nav.playground"), path: "/playground", icon: "🧩" },
    { label: t("nav.chats"), path: "/chats", icon: "💬" },
    { label: t("nav.pipeline"), path: "/candidates", icon: "👥" },
    { label: t("nav.hired"), path: "/hired", icon: "✅" },
    { label: t("nav.archived"), path: "/past-candidates", icon: "🗃" },
    { label: t("nav.analytics"), path: "/analytics", icon: "📈" },
    ...(!isOrg
      ? [{ label: t("nav.admins"), path: "/admins", icon: "⚙️" }]
      : []),
    ...(isSuperAdmin
      ? [
          {
            label: t("nav.organizations"),
            path: "/organizations",
            icon: "🏢",
          },
        ]
      : []),
    ...(isOrg
      ? [{ label: t("nav.branches"), path: "/branches", icon: "🏢" }]
      : []),
  ];
  const navItems = allNavItems;

  const DIVIDER_BEFORE = "/analytics";

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

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

  useEffect(() => {
    if (!langOpen) return;
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node))
        setLangOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [langOpen]);

  const currentLang = LANGUAGES.find((l) => l.code === lang)!;

  const sidebarContent = (
    <>
      <div className="p-4 md:p-5 border-b border-gray-700 flex justify-center">
        <div className="bg-white px-4 py-2 w-full">
          <img
            src="/logo.png"
            alt="HR Base"
            className="h-12 md:h-16 w-full object-cover"
          />
        </div>
      </div>

      <nav className="flex-1 p-3 md:p-4 space-y-1 overflow-y-auto">
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

      <div className="p-3 md:p-4 border-t border-gray-700 space-y-3">
        {/* Language Switcher */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setLangOpen((o) => !o)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <span className="text-base leading-none">{currentLang.flag}</span>
            <span className="flex-1 text-left font-medium">
              {currentLang.label}
            </span>
            <svg
              className={`w-3.5 h-3.5 text-gray-500 transition-transform ${langOpen ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {langOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setLang(l.code);
                    setLangOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                    l.code === lang
                      ? "bg-blue-600 text-white"
                      : "text-gray-300 hover:bg-gray-700 hover:text-white"
                  }`}
                >
                  <span className="text-base leading-none">{l.flag}</span>
                  <span className="font-medium">{l.label}</span>
                  {l.code === lang && (
                    <svg
                      className="w-4 h-4 ml-auto"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Admin info */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
            {admin?.name?.[0]?.toUpperCase() || "A"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{admin?.name}</p>
            <p className="text-xs text-gray-400 truncate">{admin?.role}</p>
          </div>
          <button
            onClick={() => {
              useAuthStore.getState().logout();
              navigate("/login");
            }}
            className="text-gray-500 hover:text-red-400 transition-colors p-1 rounded"
            title={t("common.signOut")}
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z"
                clipRule="evenodd"
              />
              <path
                fillRule="evenodd"
                d="M6 10a.75.75 0 01.75-.75h9.546l-1.048-.943a.75.75 0 111.004-1.114l2.5 2.25a.75.75 0 010 1.114l-2.5 2.25a.75.75 0 11-1.004-1.114l1.048-.943H6.75A.75.75 0 016 10z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 bg-gray-900 text-white rounded-xl flex items-center justify-center shadow-lg"
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-gray-900 text-white min-h-screen flex-col flex-shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="md:hidden fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-gray-900 text-white flex flex-col z-50 shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-white p-1"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
};
