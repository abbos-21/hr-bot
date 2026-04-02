import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { botsApi } from "../api";
import { useT } from "../i18n";
import { useAuthStore } from "../store/auth";
import toast from "react-hot-toast";
import { useConfirm } from "../components/ConfirmModal";

export const BotsPage: React.FC = () => {
  const { t } = useT();
  const { isOrg, admin } = useAuthStore();
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ token: "", name: "" });
  const [adding, setAdding] = useState(false);
  const { confirm, element: confirmElement } = useConfirm();

  useEffect(() => {
    botsApi
      .list()
      .then(setBots)
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const bot = await botsApi.create(form);
      // If org user created a bot, update the stored JWT
      if (bot.newToken) {
        localStorage.setItem("token", bot.newToken);
        // Refresh user session to pick up the new botId
        window.location.reload();
        return;
      }
      setBots((prev) => [bot, ...prev]);
      setForm({ token: "", name: "" });
      setShowAdd(false);
      toast.success(t("bots.botAdded"));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("bots.botAdded"));
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (bot: any) => {
    try {
      const updated = await botsApi.update(bot.id, { isActive: !bot.isActive });
      setBots((prev) =>
        prev.map((b) => (b.id === bot.id ? { ...b, ...updated } : b)),
      );
      toast.success(
        updated.isActive ? t("bots.botActivated") : t("bots.botDeactivated"),
      );
    } catch {
      toast.error(t("common.update") + " failed");
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: t("bots.deleteBot"),
      message: t("bots.deleteBotMsg"),
      danger: true,
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await botsApi.delete(id);
      setBots((prev) => prev.filter((b) => b.id !== id));
      toast.success(t("bots.botDeleted"));
    } catch {
      toast.error(t("common.delete") + " failed");
    }
  };

  return (
    <>
      {confirmElement}
      <div className="overflow-auto flex-1 p-4 sm:p-6 md:p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t("bots.title")}
            </h1>
            <p className="text-gray-500 mt-1">{t("bots.subtitle")}</p>
          </div>
          {/* Org users can only add a bot if they don't have one yet */}
          {!(isOrg() && bots.length > 0) && (
            <button className="btn-primary" onClick={() => setShowAdd(true)}>
              + {t("bots.addBot")}
            </button>
          )}
        </div>

        {showAdd && (
          <div className="card p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">
              {t("bots.addNewBot")}
            </h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="label">{t("bots.botToken")}</label>
                <input
                  type="text"
                  value={form.token}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, token: e.target.value }))
                  }
                  className="input"
                  placeholder={t("bots.botTokenPlaceholder")}
                  required
                />
                <p className="text-xs text-gray-400 mt-1">
                  {t("bots.botTokenHint")}
                </p>
              </div>
              <div>
                <label className="label">{t("bots.botName")}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="input"
                  placeholder={t("bots.botNamePlaceholder")}
                  required
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary" disabled={adding}>
                  {adding ? t("bots.adding") : t("bots.addBot")}
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

        {loading ? (
          <div className="text-center text-gray-400 py-12">
            {t("common.loading")}
          </div>
        ) : bots.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">
              {t("bots.noBotsYet")}
            </h3>
            <p className="text-gray-400 mb-4">{t("bots.noBotsDesc")}</p>
            <button className="btn-primary" onClick={() => setShowAdd(true)}>
              {t("bots.addBot")}
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {bots.map((bot) => (
              <div key={bot.id} className="card p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl">
                  🤖
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{bot.name}</h3>
                    {bot.username && (
                      <span className="text-sm text-gray-400">
                        @{bot.username}
                      </span>
                    )}
                    <span
                      className={`badge ${bot.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                    >
                      {bot.isActive
                        ? t("bots.status.active")
                        : t("bots.status.inactive")}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1 text-sm text-gray-500">
                    <span>
                      {bot._count?.questions || 0} {t("bots.questions")}
                    </span>
                    <span>
                      {bot._count?.candidates || 0} {t("bots.candidates")}
                    </span>
                    <span>
                      {bot.languages?.length || 0} {t("bots.languages")}
                    </span>
                    <span>
                      {t("bots.defaultLang")}: {bot.defaultLang}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/bots/${bot.id}`}
                    className="btn-secondary text-sm py-1.5"
                  >
                    {t("common.manage")}
                  </Link>
                  <button
                    onClick={() => handleToggle(bot)}
                    className={`text-sm py-1.5 px-3 rounded-lg font-medium transition-colors ${bot.isActive ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200" : "bg-green-100 text-green-700 hover:bg-green-200"}`}
                  >
                    {bot.isActive ? t("bots.pause") : t("common.activate")}
                  </button>
                  <button
                    onClick={() => handleDelete(bot.id)}
                    className="text-sm py-1.5 px-3 rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
