import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { botsApi } from "../api";
import toast from "react-hot-toast";

export const BotDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [bot, setBot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"languages" | "settings">("languages");
  const [langForm, setLangForm] = useState({ code: "", name: "" });
  const [addingLang, setAddingLang] = useState(false);
  const [settings, setSettings] = useState({ name: "", defaultLang: "" });
  const [newToken, setNewToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);

  useEffect(() => {
    if (!id) return;
    botsApi
      .get(id)
      .then((data) => {
        setBot(data);
        setSettings({ name: data.name, defaultLang: data.defaultLang });
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleAddLanguage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setAddingLang(true);
    try {
      const lang = await botsApi.addLanguage(id, langForm);
      setBot((b: any) => ({ ...b, languages: [...(b.languages || []), lang] }));
      setLangForm({ code: "", name: "" });
      toast.success("Language added");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to add language");
    } finally {
      setAddingLang(false);
    }
  };

  const handleDeleteLanguage = async (langId: string) => {
    if (!id || !confirm("Delete this language?")) return;
    try {
      await botsApi.deleteLanguage(id, langId);
      setBot((b: any) => ({
        ...b,
        languages: b.languages.filter((l: any) => l.id !== langId),
      }));
      toast.success("Language deleted");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Cannot delete");
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await botsApi.update(id, settings);
      setBot((b: any) => ({ ...b, ...settings }));
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save");
    }
  };

  const handleUpdateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !newToken.trim()) return;
    setSavingToken(true);
    try {
      const updated = await botsApi.updateToken(id, newToken.trim());
      setBot((b: any) => ({
        ...b,
        token: updated.token,
        username: updated.username,
      }));
      setNewToken("");
      toast.success("Token updated — bot restarted");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to update token");
    } finally {
      setSavingToken(false);
    }
  };

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;
  if (!bot) return <div className="p-8 text-gray-400">Bot not found</div>;

  const langs = bot.languages || [];

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/bots" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Bots
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">{bot.name}</h1>
        {bot.username && (
          <span className="text-gray-400 text-sm">@{bot.username}</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-green-600">
            {bot._count?.candidates || 0}
          </div>
          <div className="text-xs text-gray-500 mt-1">Candidates</div>
          <Link
            to={`/candidates?botId=${id}`}
            className="text-xs text-blue-500 hover:underline mt-1 block"
          >
            View →
          </Link>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-purple-600">
            {bot._count?.questions || 0}
          </div>
          <div className="text-xs text-gray-500 mt-1">Questions</div>
          <Link
            to="/playground"
            className="text-xs text-blue-500 hover:underline mt-1 block"
          >
            Manage in Playground →
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(["languages", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ─── Languages Tab ─── */}
      {tab === "languages" && (
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-base font-semibold mb-4">
              Supported Languages
            </h2>
            {langs.length === 0 ? (
              <p className="text-gray-400 text-sm">No languages configured</p>
            ) : (
              <div className="space-y-2">
                {langs.map((lang: any) => (
                  <div
                    key={lang.id}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded">
                        {lang.code}
                      </span>
                      <span className="font-medium">{lang.name}</span>
                      {lang.isDefault && (
                        <span className="badge bg-blue-100 text-blue-700">
                          Default
                        </span>
                      )}
                    </div>
                    {!lang.isDefault && (
                      <button
                        onClick={() => handleDeleteLanguage(lang.id)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-6">
            <h2 className="text-base font-semibold mb-4">Add Language</h2>
            <form onSubmit={handleAddLanguage} className="flex gap-3">
              <input
                type="text"
                placeholder="Code (e.g. ru)"
                value={langForm.code}
                onChange={(e) =>
                  setLangForm((f) => ({
                    ...f,
                    code: e.target.value.toLowerCase().slice(0, 5),
                  }))
                }
                className="input flex-1"
                required
                maxLength={5}
              />
              <input
                type="text"
                placeholder="Name (e.g. Russian)"
                value={langForm.name}
                onChange={(e) =>
                  setLangForm((f) => ({ ...f, name: e.target.value }))
                }
                className="input flex-1"
                required
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={addingLang}
              >
                {addingLang ? "…" : "Add"}
              </button>
            </form>
            <p className="text-xs text-gray-400 mt-2">
              Common codes: en, ru, uz, de, fr, ar, zh, es
            </p>
          </div>
        </div>
      )}

      {/* ─── Settings Tab ─── */}
      {tab === "settings" && (
        <div className="space-y-6">
          <div className="card p-6 max-w-lg">
            <h2 className="text-base font-semibold mb-4">Bot Settings</h2>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="label">Bot Name</label>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, name: e.target.value }))
                  }
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">Default Language</label>
                <select
                  value={settings.defaultLang}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, defaultLang: e.target.value }))
                  }
                  className="input"
                >
                  {langs.map((l: any) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-primary">
                Save Settings
              </button>
            </form>
          </div>

          <div className="card p-6 max-w-lg border-orange-200 bg-orange-50">
            <h2 className="text-base font-semibold mb-1 text-orange-900">
              Update Bot Token
            </h2>
            <p className="text-xs text-orange-700 mb-4">
              Changing the token will stop and restart the bot. Make sure the
              token is valid before saving.
            </p>
            <form onSubmit={handleUpdateToken} className="space-y-3">
              <div>
                <label className="label text-orange-800">New Bot Token</label>
                <input
                  type="text"
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  className="input font-mono text-sm"
                  placeholder="123456:ABC-DEF…"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={savingToken || !newToken.trim()}
                className="bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors disabled:opacity-40"
              >
                {savingToken ? "Updating…" : "Update Token"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
