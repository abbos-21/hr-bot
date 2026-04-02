import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { botsApi } from "../api";
import { useConfirm } from "../components/ConfirmModal";
import toast from "react-hot-toast";
import { useT } from "../i18n";

// ── MessagesTab component ─────────────────────────────────────────────────────

const MessagesTab: React.FC<{
  botId: string;
  langs: { code: string; name: string }[];
}> = ({ botId, langs }) => {
  // state: { [lang]: { [key]: value } }
  const { t } = useT();

  // ── Canonical message keys (labels/hints come from i18n) ──────────────
  const MESSAGE_KEYS: { key: string; labelKey: string; hintKey?: string }[] = [
    { key: "welcome", labelKey: "botDetail.messages.keys.welcome", hintKey: "botDetail.messages.keys.welcome_hint" },
    { key: "survey_complete", labelKey: "botDetail.messages.keys.survey_complete", hintKey: "botDetail.messages.keys.survey_complete_hint" },
    { key: "invalid_option", labelKey: "botDetail.messages.keys.invalid_option", hintKey: "botDetail.messages.keys.invalid_option_hint" },
    { key: "upload_file", labelKey: "botDetail.messages.keys.upload_file", hintKey: "botDetail.messages.keys.upload_file_hint" },
    { key: "please_send_file", labelKey: "botDetail.messages.keys.please_send_file", hintKey: "botDetail.messages.keys.please_send_file_hint" },
    { key: "invalid_date_format", labelKey: "botDetail.messages.keys.invalid_date_format", hintKey: "botDetail.messages.keys.invalid_date_format_hint" },
    { key: "invalid_date_value", labelKey: "botDetail.messages.keys.invalid_date_value", hintKey: "botDetail.messages.keys.invalid_date_value_hint" },
    { key: "phone_use_button", labelKey: "botDetail.messages.keys.phone_use_button", hintKey: "botDetail.messages.keys.phone_use_button_hint" },
    { key: "meeting_cancelled", labelKey: "botDetail.messages.keys.meeting_cancelled", hintKey: "botDetail.messages.keys.meeting_cancelled_hint" },
  ];

  // These are default bot messages (not UI text — they are template values shown as placeholders)
  const DEFAULTS: Record<string, string> = {
    welcome: "👋 Welcome! Please choose a language:",
    survey_complete: "✅ Thank you! Your application has been submitted successfully.",
    invalid_option: "⚠️ Please select one of the provided options.",
    upload_file: "📎 Please send a photo or file as your answer.",
    please_send_file: "📎 Please send a photo or file, not text.",
    invalid_date_format: "⚠️ Please enter your birth date in the format DD.MM.YYYY (e.g. 15.03.1998)",
    invalid_date_value: "⚠️ Please enter a valid birth date.",
    phone_use_button: "📱 Please use the button below to share your phone number.",
    meeting_cancelled: "❌ Your meeting on {date} at {time} has been cancelled.",
  };

  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [activeLang, setActiveLang] = useState(langs[0]?.code || "en");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    botsApi
      .getMessages(botId)
      .then((data: Record<string, Record<string, string>>) => setValues(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [botId]);

  useEffect(() => {
    if (!langs.find((l) => l.code === activeLang) && langs.length) {
      setActiveLang(langs[0].code);
    }
  }, [langs, activeLang]);

  const getValue = (lang: string, key: string) => values[lang]?.[key] ?? "";

  const setValue = (lang: string, key: string, val: string) =>
    setValues((prev) => ({
      ...prev,
      [lang]: { ...(prev[lang] || {}), [key]: val },
    }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const items: { lang: string; key: string; value: string }[] = [];
      for (const lang of langs) {
        for (const { key } of MESSAGE_KEYS) {
          const val = getValue(lang.code, key).trim();
          items.push({ lang: lang.code, key, value: val || "" });
        }
      }
      await botsApi.saveMessages(
        botId,
        items.filter((i) => i.value),
      );
      toast.success(t("botDetail.messages.saved"));
    } catch {
      toast.error(t("botDetail.messages.failedToSave"));
    }
    setSaving(false);
  };

  const handleReset = (lang: string, key: string) => {
    setValue(lang, key, "");
  };

  if (loading)
    return (
      <div className="text-gray-400 text-sm py-8 text-center">{t("common.loading")}</div>
    );
  if (!langs.length)
    return (
      <div className="text-gray-400 text-sm py-8 text-center">
        {t("botDetail.messages.addLangFirst")}
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Language tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {langs.map((l) => (
          <button
            key={l.code}
            onClick={() => setActiveLang(l.code)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px rounded-t-lg
              ${activeLang === l.code ? "border-blue-600 text-blue-600 bg-blue-50" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {l.name}
            <span className="ml-1.5 text-xs font-mono text-gray-400">
              ({l.code})
            </span>
          </button>
        ))}
      </div>

      {/* Message rows */}
      <div className="space-y-4">
        {MESSAGE_KEYS.map(({ key, labelKey, hintKey }) => {
          const current = getValue(activeLang, key);
          const placeholder = DEFAULTS[key] || "";
          const isCustom = current.trim().length > 0;
          const label = t(labelKey as any);
          const hint = hintKey ? t(hintKey as any) : undefined;

          return (
            <div
              key={key}
              className={`rounded-xl border p-4 transition-colors ${isCustom ? "border-blue-200 bg-blue-50/40" : "border-gray-200 bg-white"}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{label}</p>
                  {hint && (
                    <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isCustom && (
                    <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                      {t("common.custom")}
                    </span>
                  )}
                  {isCustom && (
                    <button
                      onClick={() => handleReset(activeLang, key)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors underline"
                    >
                      {t("botDetail.messages.resetToDefault")}
                    </button>
                  )}
                </div>
              </div>
              <textarea
                rows={2}
                value={current}
                onChange={(e) => setValue(activeLang, key, e.target.value)}
                placeholder={placeholder}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y bg-white placeholder-gray-300"
              />
              {!isCustom && (
                <p className="text-xs text-gray-400 mt-1">
                  {t("botDetail.messages.usingDefault")}{" "}
                  <span className="text-gray-500 italic">
                    {placeholder.slice(0, 80)}
                    {placeholder.length > 80 ? "…" : ""}
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full py-2.5"
      >
        {saving ? t("common.saving") : t("botDetail.messages.saveAll")}
      </button>
    </div>
  );
};

// ── Main BotDetailPage ────────────────────────────────────────────────────────

export const BotDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const [bot, setBot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"languages" | "messages" | "settings">(
    "languages",
  );
  const [langForm, setLangForm] = useState({ code: "", name: "" });
  const [addingLang, setAddingLang] = useState(false);
  const [settings, setSettings] = useState({ name: "", defaultLang: "" });
  const [newToken, setNewToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const { confirm, element: confirmElement } = useConfirm();

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
      toast.success(t("botDetail.languages.added"));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("botDetail.settings.failedToAddLanguage"));
    } finally {
      setAddingLang(false);
    }
  };

  const handleDeleteLanguage = async (langId: string) => {
    const ok = await confirm({
      title: t("botDetail.languages.deleteTitle"),
      message: t("botDetail.languages.deleteMsg"),
      danger: true,
      confirmLabel: t("common.delete"),
    });
    if (!id || !ok) return;
    try {
      await botsApi.deleteLanguage(id, langId);
      setBot((b: any) => ({
        ...b,
        languages: b.languages.filter((l: any) => l.id !== langId),
      }));
      toast.success(t("botDetail.languages.deleted"));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("botDetail.settings.cannotDelete"));
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      await botsApi.update(id, settings);
      setBot((b: any) => ({ ...b, ...settings }));
      toast.success(t("botDetail.settings.saved"));
    } catch {
      toast.error(t("botDetail.settings.failedToSave"));
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
      toast.success(t("botDetail.settings.tokenUpdated"));
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("botDetail.settings.failedToUpdateToken"));
    } finally {
      setSavingToken(false);
    }
  };

  if (loading)
    return (
      <div className="overflow-auto flex-1 p-4 sm:p-6 md:p-8 text-gray-400">{t("common.loading")}</div>
    );
  if (!bot) return <div className="p-4 sm:p-6 md:p-8 text-gray-400">{t("botDetail.settings.botNotFound")}</div>;

  const langs = bot.languages || [];

  return (
    <>
      {confirmElement}
      <div className="overflow-auto flex-1 p-4 sm:p-6 md:p-8 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <Link
            to="/bots"
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            {t("botDetail.back")}
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
            <div className="text-xs text-gray-500 mt-1">{t("botDetail.stats.candidates")}</div>
            <Link
              to={`/candidates?botId=${id}`}
              className="text-xs text-blue-500 hover:underline mt-1 block"
            >
              {t("botDetail.stats.viewCandidates")}
            </Link>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {bot._count?.questions || 0}
            </div>
            <div className="text-xs text-gray-500 mt-1">{t("botDetail.stats.questions")}</div>
            <Link
              to="/playground"
              className="text-xs text-blue-500 hover:underline mt-1 block"
            >
              {t("botDetail.stats.managePlayground")}
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {(["languages", "messages", "settings"] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${tab === tabKey ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              {tabKey === "messages"
                ? t("botDetail.tabs.messages")
                : tabKey === "languages"
                  ? t("botDetail.tabs.languages")
                  : t("botDetail.tabs.settings")}
            </button>
          ))}
        </div>

        {/* ─── Languages Tab ─── */}
        {tab === "languages" && (
          <div className="space-y-6">
            <div className="card p-6">
              <h2 className="text-base font-semibold mb-4">
                {t("botDetail.languages.title")}
              </h2>
              {langs.length === 0 ? (
                <p className="text-gray-400 text-sm">{t("botDetail.languages.noLanguages")}</p>
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
                            {t("botDetail.languages.defaultBadge")}
                          </span>
                        )}
                      </div>
                      {!lang.isDefault && (
                        <button
                          onClick={() => handleDeleteLanguage(lang.id)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          {t("botDetail.languages.remove")}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-6">
              <h2 className="text-base font-semibold mb-4">{t("botDetail.languages.addLanguage")}</h2>
              <form onSubmit={handleAddLanguage} className="flex gap-3">
                <input
                  type="text"
                  placeholder={t("botDetail.languages.codeLabel")}
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
                  placeholder={t("botDetail.languages.nameLabel")}
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
                  {addingLang ? "…" : t("common.add")}
                </button>
              </form>
              <p className="text-xs text-gray-400 mt-2">
                {t("botDetail.languages.commonCodes")}
              </p>
            </div>
          </div>
        )}

        {/* ─── Messages Tab ─── */}
        {tab === "messages" && (
          <div>
            <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <p className="font-semibold mb-1">{t("botDetail.messages.title")}</p>
              <p className="text-xs leading-relaxed">
                {t("botDetail.messages.hint")}
              </p>
            </div>
            {id && <MessagesTab botId={id} langs={langs} />}
          </div>
        )}

        {/* ─── Settings Tab ─── */}
        {tab === "settings" && (
          <div className="space-y-6">
            <div className="card p-6 max-w-lg">
              <h2 className="text-base font-semibold mb-4">{t("botDetail.settings.title")}</h2>
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <label className="label">{t("botDetail.settings.botName")}</label>
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
                  <label className="label">{t("botDetail.settings.defaultLang")}</label>
                  <select
                    value={settings.defaultLang}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        defaultLang: e.target.value,
                      }))
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
                  {t("botDetail.settings.saveSettings")}
                </button>
              </form>
            </div>

            <div className="card p-6 max-w-lg border-orange-200 bg-orange-50">
              <h2 className="text-base font-semibold mb-1 text-orange-900">
                {t("botDetail.settings.updateToken")}
              </h2>
              <p className="text-xs text-orange-700 mb-4">
                {t("botDetail.settings.updateTokenWarning")}
              </p>
              <form onSubmit={handleUpdateToken} className="space-y-3">
                <div>
                  <label className="label text-orange-800">{t("botDetail.settings.newToken")}</label>
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
                  {savingToken
                    ? t("botDetail.settings.updating")
                    : t("botDetail.settings.updateToken")}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
