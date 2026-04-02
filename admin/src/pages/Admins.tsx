import React, { useEffect, useState } from "react";
import { authApi } from "../api";
import { useAuthStore } from "../store/auth";
import { useT } from "../i18n";
import toast from "react-hot-toast";
import { format } from "date-fns";

export const AdminsPage: React.FC = () => {
  const { admin: currentAdmin } = useAuthStore();
  const { t } = useT();
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    login: "",
    password: "",
    name: "",
    role: "admin",
  });
  const [adding, setAdding] = useState(false);

  const isSuperAdmin = currentAdmin?.role === "super_admin";

  useEffect(() => {
    authApi
      .getAdmins()
      .then(setAdmins)
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const admin = await authApi.createAdmin(form);
      setAdmins((prev) => [...prev, admin]);
      setForm({ login: "", password: "", name: "", role: "admin" });
      setShowAdd(false);
      toast.success(t("admins.created_success"));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("admins.updateFailed"));
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (admin: any) => {
    if (!isSuperAdmin) return;
    try {
      const updated = await authApi.updateAdmin(admin.id, {
        isActive: !admin.isActive,
      });
      setAdmins((prev) =>
        prev.map((a) => (a.id === admin.id ? { ...a, ...updated } : a)),
      );
    } catch {
      toast.error(t("admins.updateFailed"));
    }
  };

  return (
    <div className="overflow-auto flex-1 p-4 sm:p-6 md:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("admins.title")}
          </h1>
          <p className="text-gray-500 mt-1">{t("admins.subtitle")}</p>
        </div>
        {isSuperAdmin && (
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            {t("admins.addAdmin")}
          </button>
        )}
      </div>

      {showAdd && isSuperAdmin && (
        <div className="card p-6 mb-6 max-w-lg">
          <h2 className="text-lg font-semibold mb-4">
            {t("admins.createAdminTitle")}
          </h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="label">{t("admins.name")}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t("admins.login")}</label>
              <input
                type="text"
                value={form.login}
                onChange={(e) =>
                  setForm((f) => ({ ...f, login: e.target.value }))
                }
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t("admins.password")}</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
                className="input"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="label">{t("admins.role")}</label>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value }))
                }
                className="input"
              >
                <option value="admin">{t("admins.roleAdmin")}</option>
                <option value="super_admin">
                  {t("admins.roleSuperAdmin")}
                </option>
              </select>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary" disabled={adding}>
                {adding ? t("admins.creating") : t("admins.createAdmin")}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAdd(false)}
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">
                {t("admins.name")}
              </th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">
                {t("admins.role")}
              </th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">
                {t("common.status")}
              </th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">
                {t("admins.created")}
              </th>
              {isSuperAdmin && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-400">
                  {t("admins.loading")}
                </td>
              </tr>
            ) : (
              admins.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-sm font-bold text-purple-700">
                        {a.name?.[0]?.toUpperCase() || "A"}
                      </div>
                      <div>
                        <p className="font-medium">
                          {a.name}
                          {a.id === currentAdmin?.id && (
                            <span className="ml-2 text-xs text-blue-500">
                              {t("admins.you")}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">{a.login}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge ${a.role === "super_admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}
                    >
                      {a.role === "super_admin"
                        ? t("admins.roleSuperAdmin")
                        : t("admins.roleAdmin")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge ${a.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}
                    >
                      {a.isActive
                        ? t("admins.statusActive")
                        : t("admins.statusInactive")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {format(new Date(a.createdAt), "MMM d, yyyy")}
                  </td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3">
                      {a.id !== currentAdmin?.id && (
                        <button
                          onClick={() => handleToggle(a)}
                          className={`text-xs px-2 py-1 rounded font-medium ${a.isActive ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}`}
                        >
                          {a.isActive
                            ? t("common.deactivate")
                            : t("common.activate")}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
