import React, { useEffect, useState } from "react";
import { branchesApi } from "../api";
import { useAuthStore } from "../store/auth";
import { useT } from "../i18n";
import toast from "react-hot-toast";
import { useConfirm } from "../components/ConfirmModal";

export const BranchesPage: React.FC = () => {
  const { admin } = useAuthStore();
  const { t } = useT();
  const { confirm, element: confirmElement } = useConfirm();
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    branchesApi
      .list()
      .then(setBranches)
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const branch = await branchesApi.create({ name: newName.trim() });
      setBranches((prev) => [...prev, branch]);
      setNewName("");
      toast.success(t("organizations.branchAdded"));
    } catch (err: any) {
      toast.error(
        err.response?.data?.error || t("organizations.branchAddFailed"),
      );
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (branch: any) => {
    try {
      const updated = await branchesApi.update(branch.id, {
        isActive: !branch.isActive,
      });
      setBranches((prev) =>
        prev.map((b) => (b.id === branch.id ? updated : b)),
      );
    } catch {
      toast.error(t("organizations.updateFailed"));
    }
  };

  const handleDelete = async (branch: any) => {
    const ok = await confirm({
      title: t("common.delete"),
      message: `${t("common.delete")} "${branch.name}"?`,
      danger: true,
    });
    if (!ok) return;
    try {
      await branchesApi.delete(branch.id);
      setBranches((prev) => prev.filter((b) => b.id !== branch.id));
      toast.success(t("organizations.branchDeleted"));
    } catch {
      toast.error(t("organizations.branchDeleteFailed"));
    }
  };

  return (
    <div className="overflow-auto flex-1 p-4 sm:p-6 md:p-8">
      {confirmElement}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("organizations.branchesTitle")}
          </h1>
          <p className="text-gray-500 mt-1">
            {t("organizations.branchesSubtitle")}
          </p>
        </div>
      </div>

      {/* Add branch */}
      <form onSubmit={handleAdd} className="card p-4 mb-6 flex gap-3">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="input flex-1"
          placeholder={t("organizations.branchNamePlaceholder")}
        />
        <button type="submit" className="btn-primary" disabled={adding}>
          {adding ? t("common.adding") : t("common.add")}
        </button>
      </form>

      {/* Branches list */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">
                {t("common.name")}
              </th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">
                {t("common.status")}
              </th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">
                {t("organizations.candidateCount")}
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-400">
                  {t("common.loading")}
                </td>
              </tr>
            ) : branches.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-400">
                  {t("organizations.noBranches")}
                </td>
              </tr>
            ) : (
              branches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge text-xs ${b.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}
                    >
                      {b.isActive
                        ? t("common.active")
                        : t("common.inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {b._count?.candidates ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleToggle(b)}
                      className={`text-xs px-2 py-1 rounded font-medium mr-2 ${b.isActive ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}`}
                    >
                      {b.isActive
                        ? t("common.deactivate")
                        : t("common.activate")}
                    </button>
                    <button
                      onClick={() => handleDelete(b)}
                      className="text-xs px-2 py-1 rounded font-medium text-red-600 hover:bg-red-50"
                    >
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
