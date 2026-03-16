import React, { useEffect, useState } from "react";
import { organizationsApi, botsApi, branchesApi } from "../api";
import { useT } from "../i18n";
import toast from "react-hot-toast";
import { format } from "date-fns";

export const OrganizationsPage: React.FC = () => {
  const { t } = useT();
  const [orgs, setOrgs] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    botId: "",
    branchesText: "",
  });
  const [adding, setAdding] = useState(false);
  const [editingOrg, setEditingOrg] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  // Branch management
  const [branchOrgId, setBranchOrgId] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState("");

  useEffect(() => {
    Promise.all([organizationsApi.list(), botsApi.list()])
      .then(([o, b]) => {
        setOrgs(o);
        setBots(b);
      })
      .finally(() => setLoading(false));
  }, []);

  const unassignedBots = bots.filter(
    (b: any) =>
      !b.organizationId ||
      b.organizationId === editingOrg,
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const branches = form.branchesText
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);
      const org = await organizationsApi.create({
        name: form.name,
        email: form.email,
        password: form.password,
        botId: form.botId || undefined,
        branches: branches.length ? branches : undefined,
      });
      setOrgs((prev) => [org, ...prev]);
      setForm({ name: "", email: "", password: "", botId: "", branchesText: "" });
      setShowAdd(false);
      toast.success(t("organizations.created"));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("organizations.createFailed"));
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (org: any) => {
    try {
      const updated = await organizationsApi.update(org.id, {
        isActive: !org.isActive,
      });
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? updated : o)));
    } catch {
      toast.error(t("organizations.updateFailed"));
    }
  };

  const handleDelete = async (org: any) => {
    if (!confirm(t("organizations.deleteConfirm"))) return;
    try {
      await organizationsApi.delete(org.id);
      setOrgs((prev) => prev.filter((o) => o.id !== org.id));
      toast.success(t("organizations.deleted"));
    } catch {
      toast.error(t("organizations.deleteFailed"));
    }
  };

  const startEdit = (org: any) => {
    setEditingOrg(org.id);
    setEditForm({
      name: org.name,
      email: org.email,
      botId: org.bot?.id || "",
    });
  };

  const handleSaveEdit = async () => {
    try {
      let updated = await organizationsApi.update(editingOrg!, {
        name: editForm.name,
        email: editForm.email,
      });
      // Handle bot assignment
      const currentBotId = orgs.find((o) => o.id === editingOrg)?.bot?.id;
      if (editForm.botId && editForm.botId !== currentBotId) {
        updated = await organizationsApi.assignBot(editingOrg!, editForm.botId);
      } else if (!editForm.botId && currentBotId) {
        await organizationsApi.unlinkBot(editingOrg!);
        updated = { ...updated, bot: null };
      }
      setOrgs((prev) => prev.map((o) => (o.id === editingOrg ? updated : o)));
      setEditingOrg(null);
      toast.success(t("organizations.updated"));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("organizations.updateFailed"));
    }
  };

  const handleAddBranch = async (orgId: string) => {
    if (!newBranchName.trim()) return;
    try {
      const branch = await branchesApi.create({
        name: newBranchName.trim(),
        organizationId: orgId,
      });
      setOrgs((prev) =>
        prev.map((o) =>
          o.id === orgId
            ? { ...o, branches: [...(o.branches || []), branch] }
            : o,
        ),
      );
      setNewBranchName("");
      toast.success(t("organizations.branchAdded"));
    } catch (err: any) {
      toast.error(
        err.response?.data?.error || t("organizations.branchAddFailed"),
      );
    }
  };

  const handleDeleteBranch = async (orgId: string, branchId: string) => {
    try {
      await branchesApi.delete(branchId);
      setOrgs((prev) =>
        prev.map((o) =>
          o.id === orgId
            ? {
                ...o,
                branches: o.branches.filter((b: any) => b.id !== branchId),
              }
            : o,
        ),
      );
      toast.success(t("organizations.branchDeleted"));
    } catch {
      toast.error(t("organizations.branchDeleteFailed"));
    }
  };

  return (
    <div className="overflow-auto flex-1 p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t("organizations.title")}
          </h1>
          <p className="text-gray-500 mt-1">{t("organizations.subtitle")}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          {t("organizations.addOrg")}
        </button>
      </div>

      {showAdd && (
        <div className="card p-6 mb-6 max-w-lg">
          <h2 className="text-lg font-semibold mb-4">
            {t("organizations.createTitle")}
          </h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="label">{t("common.name")}</label>
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
              <label className="label">{t("common.email")}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">{t("common.password")}</label>
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
              <label className="label">{t("organizations.assignBot")}</label>
              <select
                value={form.botId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, botId: e.target.value }))
                }
                className="input"
              >
                <option value="">{t("organizations.noBot")}</option>
                {unassignedBots.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.name} (@{b.username})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t("organizations.branches")}</label>
              <input
                type="text"
                value={form.branchesText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, branchesText: e.target.value }))
                }
                className="input"
                placeholder={t("organizations.branchesPlaceholder")}
              />
              <p className="text-xs text-gray-400 mt-1">
                {t("organizations.branchesHint")}
              </p>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary" disabled={adding}>
                {adding
                  ? t("common.creating")
                  : t("organizations.createOrg")}
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

      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-8 text-gray-400">
            {t("common.loading")}
          </div>
        ) : orgs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {t("organizations.noOrgs")}
          </div>
        ) : (
          orgs.map((org) => (
            <div key={org.id} className="card p-5">
              {editingOrg === org.id ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">{t("common.name")}</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm((f: any) => ({
                            ...f,
                            name: e.target.value,
                          }))
                        }
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">{t("common.email")}</label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) =>
                          setEditForm((f: any) => ({
                            ...f,
                            email: e.target.value,
                          }))
                        }
                        className="input"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">
                      {t("organizations.assignBot")}
                    </label>
                    <select
                      value={editForm.botId}
                      onChange={(e) =>
                        setEditForm((f: any) => ({
                          ...f,
                          botId: e.target.value,
                        }))
                      }
                      className="input"
                    >
                      <option value="">{t("organizations.noBot")}</option>
                      {unassignedBots.map((b: any) => (
                        <option key={b.id} value={b.id}>
                          {b.name} (@{b.username})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-primary text-sm"
                      onClick={handleSaveEdit}
                    >
                      {t("common.save")}
                    </button>
                    <button
                      className="btn-secondary text-sm"
                      onClick={() => setEditingOrg(null)}
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold">{org.name}</h3>
                        <span
                          className={`badge text-xs ${org.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}
                        >
                          {org.isActive
                            ? t("common.active")
                            : t("common.inactive")}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">{org.email}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {t("common.createdAt")}:{" "}
                        {format(new Date(org.createdAt), "MMM d, yyyy")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(org)}
                        className="text-xs px-3 py-1 rounded font-medium text-blue-600 hover:bg-blue-50"
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        onClick={() => handleToggle(org)}
                        className={`text-xs px-3 py-1 rounded font-medium ${org.isActive ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}`}
                      >
                        {org.isActive
                          ? t("common.deactivate")
                          : t("common.activate")}
                      </button>
                      <button
                        onClick={() => handleDelete(org)}
                        className="text-xs px-3 py-1 rounded font-medium text-red-600 hover:bg-red-50"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>

                  {/* Bot info */}
                  <div className="mt-3 flex items-center gap-4 text-sm">
                    <span className="text-gray-500">
                      {t("organizations.bot")}:{" "}
                      {org.bot ? (
                        <span className="font-medium text-gray-700">
                          {org.bot.name} (@{org.bot.username})
                        </span>
                      ) : (
                        <span className="text-gray-400">
                          {t("organizations.noBot")}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Branches */}
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        {t("organizations.branches")} ({org.branches?.length || 0})
                      </span>
                      <button
                        onClick={() =>
                          setBranchOrgId(
                            branchOrgId === org.id ? null : org.id,
                          )
                        }
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {branchOrgId === org.id
                          ? t("common.close")
                          : t("common.manage")}
                      </button>
                    </div>

                    {org.branches?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {org.branches.map((b: any) => (
                          <span
                            key={b.id}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${b.isActive ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"}`}
                          >
                            {b.name}
                            {branchOrgId === org.id && (
                              <button
                                onClick={() =>
                                  handleDeleteBranch(org.id, b.id)
                                }
                                className="ml-1 text-red-400 hover:text-red-600"
                              >
                                x
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    {branchOrgId === org.id && (
                      <div className="flex gap-2 mt-2">
                        <input
                          type="text"
                          value={newBranchName}
                          onChange={(e) => setNewBranchName(e.target.value)}
                          className="input text-sm flex-1"
                          placeholder={t("organizations.branchNamePlaceholder")}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddBranch(org.id);
                            }
                          }}
                        />
                        <button
                          onClick={() => handleAddBranch(org.id)}
                          className="btn-primary text-sm"
                        >
                          {t("common.add")}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
