import React, { useEffect, useState, useCallback } from "react";
import { botsApi, questionsApi } from "../api";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type QType = "text" | "choice" | "attachment";

interface Translation {
  lang: string;
  text: string;
  successMessage?: string | null;
  errorMessage?: string | null;
}
interface QOption {
  id?: string;
  order: number;
  translations: { lang: string; text: string }[];
}

interface Question {
  id: string;
  type: QType;
  isRequired?: boolean;
  fieldKey?: string | null;
  filterLabel?: string | null;
  translations: Translation[];
  options: QOption[];
}

const TYPE_META: Record<
  QType,
  { icon: string; label: string; color: string; bg: string; border: string }
> = {
  text: {
    icon: "✏️",
    label: "Text",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  choice: {
    icon: "☑️",
    label: "Choice",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  attachment: {
    icon: "📎",
    label: "Attachment",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
};

const REQUIRED_FIELD_LABELS: Record<string, string> = {
  fullName: "👤 Full Name",
  age: "🎂 Age",
  phone: "📱 Phone",
  profilePhoto: "📸 Profile Photo",
};

function qText(q: Question) {
  return q.translations[0]?.text || "Untitled question";
}

// ─── Message Editor Modal ─────────────────────────────────────────────────────

const MessageEditorModal: React.FC<{
  question: Question;
  langs: any[];
  onSave: (
    translations: {
      lang: string;
      successMessage: string | null;
      errorMessage: string | null;
    }[],
  ) => Promise<void>;
  onClose: () => void;
}> = ({ question, langs, onSave, onClose }) => {
  // Build initial state: { [lang]: { success, error } }
  const init: Record<string, { success: string; error: string }> = {};
  langs.forEach((l: any) => {
    const tr = question.translations.find((t) => t.lang === l.code);
    init[l.code] = {
      success: tr?.successMessage || "",
      error: tr?.errorMessage || "",
    };
  });
  const [msgs, setMsgs] =
    useState<Record<string, { success: string; error: string }>>(init);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(
        langs.map((l: any) => ({
          lang: l.code,
          successMessage: msgs[l.code]?.success || null,
          errorMessage: msgs[l.code]?.error || null,
        })),
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Response Messages</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Leave blank to use the default system message. Set per language.
        </p>
        {langs.map((l: any) => (
          <div
            key={l.code}
            className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50"
          >
            <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
              <span className="font-mono bg-white border border-gray-200 px-1.5 py-0.5 rounded text-xs">
                {l.code}
              </span>
              {l.name}
            </p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                ✅ Success message
              </label>
              <textarea
                value={msgs[l.code]?.success || ""}
                onChange={(e) =>
                  setMsgs((m) => ({
                    ...m,
                    [l.code]: { ...m[l.code], success: e.target.value },
                  }))
                }
                placeholder={`e.g. Great, got it! ✅`}
                rows={2}
                className="input resize-none text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                ❌ Error message
              </label>
              <textarea
                value={msgs[l.code]?.error || ""}
                onChange={(e) =>
                  setMsgs((m) => ({
                    ...m,
                    [l.code]: { ...m[l.code], error: e.target.value },
                  }))
                }
                placeholder={`e.g. Please send a photo, not text.`}
                rows={2}
                className="input resize-none text-sm"
              />
            </div>
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Required Question Row ────────────────────────────────────────────────────

const RequiredQuestionRow: React.FC<{
  question: Question;
  langs: any[];
  onUpdate: (q: Question) => void;
}> = ({ question, langs, onUpdate }) => {
  const [editing, setEditing] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>(
    Object.fromEntries(question.translations.map((t) => [t.lang, t.text])),
  );
  const [showMessages, setShowMessages] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await questionsApi.update(question.id, {
        translations: Object.entries(translations).map(([lang, text]) => ({
          lang,
          text,
        })),
      });
      onUpdate(updated);
      setEditing(false);
      toast.success("Question updated");
    } catch {
      toast.error("Failed to save");
    }
    setSaving(false);
  };

  const handleSaveMessages = async (
    msgTranslations: {
      lang: string;
      successMessage: string | null;
      errorMessage: string | null;
    }[],
  ) => {
    // Merge with existing translations
    const existing = Object.fromEntries(
      question.translations.map((t) => [t.lang, t]),
    );
    const merged = langs.map((l: any) => {
      const msg = msgTranslations.find((m) => m.lang === l.code);
      return {
        lang: l.code,
        text: existing[l.code]?.text || "",
        successMessage:
          msg?.successMessage ?? existing[l.code]?.successMessage ?? null,
        errorMessage:
          msg?.errorMessage ?? existing[l.code]?.errorMessage ?? null,
      };
    });
    const updated = await questionsApi.update(question.id, {
      translations: merged,
    });
    onUpdate(updated);
    toast.success("Messages updated");
  };

  const label =
    REQUIRED_FIELD_LABELS[question.fieldKey || ""] || question.fieldKey;

  return (
    <div className="bg-white rounded-xl border-2 border-blue-100 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-sm">
          🔒
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              Required
            </span>
            <span className="text-xs text-gray-400">{label}</span>
          </div>
          {editing ? (
            <div className="space-y-2 mt-2">
              {langs.map((l: any) => (
                <div key={l.code} className="flex gap-2">
                  <span className="text-xs font-mono bg-gray-100 px-2 py-2 rounded w-10 text-center text-gray-500 flex-shrink-0">
                    {l.code}
                  </span>
                  <input
                    value={translations[l.code] || ""}
                    onChange={(e) =>
                      setTranslations((t) => ({
                        ...t,
                        [l.code]: e.target.value,
                      }))
                    }
                    className="input flex-1 text-sm"
                    placeholder={`In ${l.name}…`}
                  />
                </div>
              ))}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  {saving ? "…" : "Save"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-800 mt-0.5">{qText(question)}</p>
          )}
          {question.translations.some(
            (t) => t.successMessage || t.errorMessage,
          ) &&
            (() => {
              const tr = question.translations[0];
              return (
                <div className="mt-2 flex gap-3 flex-wrap text-xs text-gray-400">
                  {tr?.successMessage && (
                    <span>
                      ✅ "{tr.successMessage.slice(0, 40)}
                      {tr.successMessage.length > 40 ? "…" : ""}"
                    </span>
                  )}
                  {tr?.errorMessage && (
                    <span>
                      ❌ "{tr.errorMessage.slice(0, 40)}
                      {tr.errorMessage.length > 40 ? "…" : ""}"
                    </span>
                  )}
                </div>
              );
            })()}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => setShowMessages(true)}
            title="Edit response messages"
            className="text-xs px-2 py-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            💬
          </button>
          <button
            onClick={() => setEditing((e) => !e)}
            title="Edit question text"
            className="text-xs px-2 py-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            ✏️
          </button>
        </div>
      </div>
      {showMessages && (
        <MessageEditorModal
          question={question}
          langs={langs}
          onSave={handleSaveMessages}
          onClose={() => setShowMessages(false)}
        />
      )}
    </div>
  );
};

// ─── Custom Question Card ─────────────────────────────────────────────────────

const CustomQuestionCard: React.FC<{
  question: Question;
  langs: any[];
  onUpdate: (q: Question) => void;
  onDelete: (id: string) => void;
}> = ({ question, langs, onUpdate, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [saving, setSaving] = useState(false);
  const meta = TYPE_META[question.type];

  // Form state (only initialised when editing opens)
  const [type, setType] = useState<QType>(question.type);
  const [translations, setTranslations] = useState<Record<string, string>>(
    Object.fromEntries(question.translations.map((t) => [t.lang, t.text])),
  );
  const [options, setOptions] = useState<
    { translations: Record<string, string> }[]
  >(
    question.options.map((o) => ({
      translations: Object.fromEntries(
        o.translations.map((t) => [t.lang, t.text]),
      ),
    })),
  );
  const [filterLabel, setFilterLabel] = useState(question.filterLabel || "");

  const openEdit = () => {
    setType(question.type);
    setTranslations(
      Object.fromEntries(question.translations.map((t) => [t.lang, t.text])),
    );
    setOptions(
      question.options.map((o) => ({
        translations: Object.fromEntries(
          o.translations.map((t) => [t.lang, t.text]),
        ),
      })),
    );
    setFilterLabel(question.filterLabel || "");
    setEditing(true);
  };

  const handleSave = async () => {
    if (type === "choice" && options.length === 0) {
      toast.error("Add at least one option");
      return;
    }
    setSaving(true);
    try {
      const updated = await questionsApi.update(question.id, {
        type,
        filterLabel:
          type === "choice" && filterLabel.trim() ? filterLabel.trim() : null,
        translations: Object.entries(translations)
          .filter(([, v]) => v)
          .map(([lang, text]) => ({ lang, text })),
        options:
          type === "choice"
            ? options.map((opt, i) => ({
                order: i,
                translations: Object.entries(opt.translations)
                  .filter(([, v]) => v)
                  .map(([lang, text]) => ({ lang, text })),
              }))
            : [],
      });
      onUpdate(updated);
      setEditing(false);
      toast.success("Question updated");
    } catch {
      toast.error("Failed to save");
    }
    setSaving(false);
  };

  const handleSaveMessages = async (
    msgTranslations: {
      lang: string;
      successMessage: string | null;
      errorMessage: string | null;
    }[],
  ) => {
    // Merge with existing translations
    const existing = Object.fromEntries(
      question.translations.map((t) => [t.lang, t]),
    );
    const merged = langs.map((l: any) => {
      const msg = msgTranslations.find((m) => m.lang === l.code);
      return {
        lang: l.code,
        text: existing[l.code]?.text || "",
        successMessage:
          msg?.successMessage ?? existing[l.code]?.successMessage ?? null,
        errorMessage:
          msg?.errorMessage ?? existing[l.code]?.errorMessage ?? null,
      };
    });
    const updated = await questionsApi.update(question.id, {
      translations: merged,
    });
    onUpdate(updated);
    toast.success("Messages updated");
  };

  const handleDelete = async () => {
    if (!confirm("Delete this question?")) return;
    try {
      await questionsApi.delete(question.id);
      onDelete(question.id);
      toast.success("Question deleted");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to delete");
    }
  };

  return (
    <div className={`bg-white rounded-xl border-2 ${meta.border} p-4`}>
      {!editing ? (
        <div className="flex items-start gap-3">
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center text-sm`}
          >
            {meta.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-xs font-semibold ${meta.color} ${meta.bg} px-2 py-0.5 rounded-full`}
              >
                {meta.label}
              </span>
            </div>
            <p className="text-sm text-gray-800">{qText(question)}</p>
            {question.type === "choice" && question.options.length > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-gray-400">
                  {question.options.length} options
                </p>
                {question.filterLabel && (
                  <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    🔽 {question.filterLabel}
                  </span>
                )}
              </div>
            )}
            {question.translations.some(
              (t) => t.successMessage || t.errorMessage,
            ) &&
              (() => {
                const tr = question.translations[0];
                return (
                  <div className="mt-2 flex gap-3 flex-wrap text-xs text-gray-400">
                    {tr?.successMessage && (
                      <span>
                        ✅ "{tr.successMessage.slice(0, 40)}
                        {tr.successMessage.length > 40 ? "…" : ""}"
                      </span>
                    )}
                    {tr?.errorMessage && (
                      <span>
                        ❌ "{tr.errorMessage.slice(0, 40)}
                        {tr.errorMessage.length > 40 ? "…" : ""}"
                      </span>
                    )}
                  </div>
                );
              })()}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => setShowMessages(true)}
              title="Edit response messages"
              className="text-xs px-2 py-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              💬
            </button>
            <button
              onClick={openEdit}
              className="text-xs px-2 py-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              ✏️
            </button>
            <button
              onClick={handleDelete}
              className="text-xs px-2 py-1 rounded text-red-300 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              🗑
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Type selector */}
          <div className="flex gap-2">
            {(Object.keys(TYPE_META) as QType[]).map((t) => {
              const m = TYPE_META[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                    setOptions([]);
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-sm font-medium transition-all
                    ${type === t ? `${m.border} ${m.bg} ${m.color}` : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                >
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>

          {/* Translations */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
              Question Text
            </label>
            {langs.map((l: any) => (
              <div key={l.code} className="flex gap-2 mb-2">
                <span className="text-xs font-mono bg-gray-100 px-2 py-2 rounded w-10 text-center text-gray-500 flex-shrink-0">
                  {l.code}
                </span>
                <input
                  value={translations[l.code] || ""}
                  onChange={(e) =>
                    setTranslations((p) => ({ ...p, [l.code]: e.target.value }))
                  }
                  className="input flex-1 text-sm"
                  placeholder={`In ${l.name}…`}
                />
              </div>
            ))}
          </div>

          {/* Choice options */}
          {type === "choice" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Options
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setOptions((o) => [...o, { translations: {} }])
                  }
                  className="text-xs text-blue-600 font-medium"
                >
                  + Add option
                </button>
              </div>
              {options.map((opt, idx) => (
                <div
                  key={idx}
                  className="bg-gray-50 rounded-xl p-3 mb-2 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">
                      Option {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setOptions((o) => o.filter((_, i) => i !== idx))
                      }
                      className="text-xs text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                  {langs.map((l: any) => (
                    <div key={l.code} className="flex gap-2">
                      <span className="text-xs font-mono bg-white border border-gray-200 px-2 py-1.5 rounded w-10 text-center text-gray-500 flex-shrink-0">
                        {l.code}
                      </span>
                      <input
                        value={opt.translations[l.code] || ""}
                        onChange={(e) =>
                          setOptions((o) => {
                            const n = [...o];
                            n[idx] = {
                              ...n[idx],
                              translations: {
                                ...n[idx].translations,
                                [l.code]: e.target.value,
                              },
                            };
                            return n;
                          })
                        }
                        className="input flex-1 text-sm"
                        placeholder={`Option in ${l.name}`}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Filter label — only for choice questions */}
          {type === "choice" && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
                Filter Label{" "}
                <span className="font-normal text-gray-400">
                  (optional — shown in Pipeline filters)
                </span>
              </label>
              <input
                type="text"
                value={filterLabel}
                onChange={(e) => setFilterLabel(e.target.value)}
                placeholder="e.g. Position, Department, Experience…"
                className="input w-full text-sm"
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-sm py-1.5 flex-1"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="btn-secondary text-sm py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showMessages && (
        <MessageEditorModal
          question={question}
          langs={langs}
          onSave={handleSaveMessages}
          onClose={() => setShowMessages(false)}
        />
      )}
    </div>
  );
};

// ─── Add Question Form ────────────────────────────────────────────────────────

const AddQuestionForm: React.FC<{
  botId: string;
  langs: any[];
  existingCount: number;
  onAdd: (q: Question) => void;
  onCancel: () => void;
}> = ({ botId, langs, existingCount, onAdd, onCancel }) => {
  const [type, setType] = useState<QType>("text");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<
    { translations: Record<string, string> }[]
  >([]);
  const [filterLabel, setFilterLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      type === "choice" &&
      options.filter((o) => Object.values(o.translations).some((v) => v.trim()))
        .length === 0
    ) {
      toast.error("Add at least one option");
      return;
    }
    setSaving(true);
    try {
      const q = await questionsApi.create({
        botId,
        type,
        order: existingCount,
        filterLabel:
          type === "choice" && filterLabel.trim() ? filterLabel.trim() : null,
        translations: Object.entries(translations)
          .filter(([, v]) => v.trim())
          .map(([lang, text]) => ({ lang, text })),
        options:
          type === "choice"
            ? options.map((opt, i) => ({
                order: i,
                translations: Object.entries(opt.translations)
                  .filter(([, v]) => v.trim())
                  .map(([lang, text]) => ({ lang, text })),
              }))
            : [],
      });
      onAdd(q);
      toast.success("Question added");
    } catch {
      toast.error("Failed to add");
    }
    setSaving(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-blue-50 border-2 border-blue-100 rounded-xl p-4 space-y-4"
    >
      <p className="text-sm font-semibold text-blue-900">New Question</p>

      <div className="flex gap-2">
        {(Object.keys(TYPE_META) as QType[]).map((t) => {
          const m = TYPE_META[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                setOptions([]);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-sm font-medium transition-all
                ${type === t ? `${m.border} ${m.bg} ${m.color}` : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"}`}
            >
              {m.icon} {m.label}
            </button>
          );
        })}
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
          Question Text
        </label>
        {langs.map((l: any) => (
          <div key={l.code} className="flex gap-2 mb-2">
            <span className="text-xs font-mono bg-white px-2 py-2 rounded w-10 text-center text-gray-500 flex-shrink-0 border border-gray-200">
              {l.code}
            </span>
            <input
              value={translations[l.code] || ""}
              onChange={(e) =>
                setTranslations((p) => ({ ...p, [l.code]: e.target.value }))
              }
              className="input flex-1 text-sm"
              placeholder={`In ${l.name}…`}
              required={l.isDefault}
            />
          </div>
        ))}
      </div>

      {type === "choice" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Options
            </label>
            <button
              type="button"
              onClick={() => setOptions((o) => [...o, { translations: {} }])}
              className="text-xs text-blue-600 font-medium"
            >
              + Add option
            </button>
          </div>
          {options.map((opt, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl p-3 mb-2 space-y-1.5 border border-gray-200"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">
                  Option {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setOptions((o) => o.filter((_, i) => i !== idx))
                  }
                  className="text-xs text-red-400"
                >
                  Remove
                </button>
              </div>
              {langs.map((l: any) => (
                <div key={l.code} className="flex gap-2">
                  <span className="text-xs font-mono bg-gray-50 border border-gray-200 px-2 py-1.5 rounded w-10 text-center text-gray-500 flex-shrink-0">
                    {l.code}
                  </span>
                  <input
                    value={opt.translations[l.code] || ""}
                    onChange={(e) =>
                      setOptions((o) => {
                        const n = [...o];
                        n[idx] = {
                          ...n[idx],
                          translations: {
                            ...n[idx].translations,
                            [l.code]: e.target.value,
                          },
                        };
                        return n;
                      })
                    }
                    className="input flex-1 text-sm"
                    placeholder={`Option in ${l.name}`}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Filter label — only for choice questions */}
      {type === "choice" && (
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
            Filter Label{" "}
            <span className="font-normal text-gray-400">
              (optional — shown in Pipeline filters)
            </span>
          </label>
          <input
            type="text"
            value={filterLabel}
            onChange={(e) => setFilterLabel(e.target.value)}
            placeholder="e.g. Position, Department, Experience…"
            className="input w-full text-sm bg-white"
          />
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving ? "Adding…" : "Add Question"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const PlaygroundPage: React.FC = () => {
  const [bots, setBots] = useState<any[]>([]);
  const [selectedBotId, setSelectedBotId] = useState("");
  const [requiredQuestions, setRequiredQuestions] = useState<Question[]>([]);
  const [customQuestions, setCustomQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingQ, setAddingQ] = useState(false);

  useEffect(() => {
    botsApi.list().then((b) => {
      setBots(b);
      if (b.length > 0) setSelectedBotId(b[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedBotId) return;
    setLoading(true);
    questionsApi
      .list({ botId: selectedBotId })
      .then((qs) => {
        setRequiredQuestions(
          qs
            .filter((q: any) => q.isRequired)
            .sort((a: any, b: any) => a.order - b.order),
        );
        setCustomQuestions(
          qs
            .filter((q: any) => !q.isRequired)
            .sort((a: any, b: any) => a.order - b.order),
        );
      })
      .finally(() => setLoading(false));
  }, [selectedBotId]);

  const selectedBot = bots.find((b) => b.id === selectedBotId);
  const langs = selectedBot?.languages || [];

  const updateQuestion = useCallback((updated: Question) => {
    if (updated.isRequired) {
      setRequiredQuestions((prev) =>
        prev.map((q) => (q.id === updated.id ? updated : q)),
      );
    } else {
      setCustomQuestions((prev) =>
        prev.map((q) => (q.id === updated.id ? updated : q)),
      );
    }
  }, []);

  const deleteQuestion = useCallback((id: string) => {
    setCustomQuestions((prev) => prev.filter((q) => q.id !== id));
  }, []);

  return (
    <div className="overflow-auto flex-1 p-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Question Playground
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Manage all bot questions and their response messages
          </p>
        </div>
        <select
          value={selectedBotId}
          onChange={(e) => {
            setSelectedBotId(e.target.value);
            setAddingQ(false);
          }}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
        >
          {bots.length === 0 && <option value="">No bots configured</option>}
          {bots.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-gray-400 text-sm">Loading…</p>}

      {!loading && selectedBotId && (
        <div className="space-y-8">
          {/* Required Questions */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-bold text-gray-700">
                🔒 Required Questions
              </h2>
              <span className="text-xs text-gray-400">
                — always asked first, cannot be removed
              </span>
            </div>
            <div className="space-y-3">
              {requiredQuestions.map((q) => (
                <RequiredQuestionRow
                  key={q.id}
                  question={q}
                  langs={langs}
                  onUpdate={updateQuestion}
                />
              ))}
            </div>
          </div>

          {/* Custom Questions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-700">
                ✏️ Additional Questions
              </h2>
              {!addingQ && (
                <button
                  onClick={() => setAddingQ(true)}
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  + Add Question
                </button>
              )}
            </div>
            <div className="space-y-3">
              {customQuestions.length === 0 && !addingQ && (
                <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
                  <p className="text-2xl mb-2">✏️</p>
                  <p className="text-sm font-medium">
                    No additional questions yet
                  </p>
                  <p className="text-xs mt-1">
                    Click "Add Question" to create one
                  </p>
                </div>
              )}
              {customQuestions.map((q) => (
                <CustomQuestionCard
                  key={q.id}
                  question={q}
                  langs={langs}
                  onUpdate={updateQuestion}
                  onDelete={deleteQuestion}
                />
              ))}
              {addingQ && (
                <AddQuestionForm
                  botId={selectedBotId}
                  langs={langs}
                  existingCount={customQuestions.length}
                  onAdd={(q) => {
                    setCustomQuestions((prev) => [...prev, q]);
                    setAddingQ(false);
                  }}
                  onCancel={() => setAddingQ(false)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
