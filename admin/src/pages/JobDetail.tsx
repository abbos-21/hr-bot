import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { jobsApi, questionsApi, botsApi, templatesApi } from "../api";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type QType = "text" | "choice" | "attachment";

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

// ─── Question Form ────────────────────────────────────────────────────────────

interface QFormState {
  type: QType;
  fieldKey: string;
  translations: Record<string, string>;
  options: { translations: Record<string, string> }[];
}
const emptyForm = (): QFormState => ({
  type: "text",
  fieldKey: "",
  translations: {},
  options: [],
});

const QuestionForm: React.FC<{
  langs: any[];
  initial?: QFormState;
  submitLabel?: string;
  onSubmit: (data: QFormState) => Promise<void>;
  onCancel?: () => void;
}> = ({ langs, initial, submitLabel = "Add Question", onSubmit, onCancel }) => {
  const [form, setForm] = useState<QFormState>(initial ?? emptyForm());
  const [saving, setSaving] = useState(false);

  const choiceError =
    form.type === "choice" && form.options.length === 0
      ? "Add at least one option for a choice question."
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (choiceError) return;
    setSaving(true);
    try {
      await onSubmit(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type picker */}
      <div>
        <label className="label">Question Type</label>
        <div className="flex gap-2">
          {(["text", "choice", "attachment"] as QType[]).map((t) => {
            const m = TYPE_META[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: t, options: [] }))}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-sm font-medium transition-all
                  ${form.type === t ? `${m.border} ${m.bg} ${m.color}` : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
              >
                {m.icon} {m.label}
              </button>
            );
          })}
        </div>
        {form.type === "attachment" && (
          <p className="mt-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">
            📎 Candidate must send a file, photo, or document as their answer.
          </p>
        )}
      </div>

      {/* Question text */}
      <div>
        <label className="label">Question Text</label>
        {langs.length === 0 && (
          <p className="text-xs text-gray-400">No languages configured.</p>
        )}
        {langs.map((lang: any) => (
          <div key={lang.code} className="flex gap-2 mb-2">
            <span className="text-xs font-mono bg-gray-100 px-2 py-2 rounded w-10 text-center text-gray-500 flex-shrink-0">
              {lang.code}
            </span>
            <input
              type="text"
              value={form.translations[lang.code] || ""}
              className="input flex-1"
              placeholder={`Question in ${lang.name}…`}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  translations: {
                    ...f.translations,
                    [lang.code]: e.target.value,
                  },
                }))
              }
            />
          </div>
        ))}
      </div>

      {/* Choice options */}
      {form.type === "choice" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Options</label>
            <button
              type="button"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  options: [...f.options, { translations: {} }],
                }))
              }
            >
              + Add option
            </button>
          </div>
          {form.options.map((opt, idx) => (
            <div
              key={idx}
              className="bg-gray-50 rounded-xl p-3 mb-2 space-y-1.5"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-500">
                  Option {idx + 1}
                </span>
                <button
                  type="button"
                  className="text-xs text-red-400 hover:text-red-600"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      options: f.options.filter((_, i) => i !== idx),
                    }))
                  }
                >
                  Remove
                </button>
              </div>
              {langs.map((lang: any) => (
                <div key={lang.code} className="flex gap-2">
                  <span className="text-xs font-mono bg-white border border-gray-200 px-2 py-1.5 rounded w-10 text-center text-gray-500 flex-shrink-0">
                    {lang.code}
                  </span>
                  <input
                    type="text"
                    value={opt.translations[lang.code] || ""}
                    className="input flex-1 text-sm"
                    placeholder={`Option in ${lang.name}…`}
                    onChange={(e) =>
                      setForm((f) => {
                        const opts = [...f.options];
                        opts[idx] = {
                          ...opts[idx],
                          translations: {
                            ...opts[idx].translations,
                            [lang.code]: e.target.value,
                          },
                        };
                        return { ...f, options: opts };
                      })
                    }
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Field key */}
      <div>
        <label className="label">
          Maps to Profile Field{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <select
          value={form.fieldKey}
          onChange={(e) => setForm((f) => ({ ...f, fieldKey: e.target.value }))}
          className="input w-full"
        >
          <option value="">None</option>
          <option value="fullName">Full Name</option>
          <option value="age">Age</option>
          <option value="phone">Phone</option>
          <option value="email">Email</option>
        </select>
      </div>

      {choiceError && (
        <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">
          {choiceError}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || !!choiceError}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};

// ─── Question Row ─────────────────────────────────────────────────────────────

const QuestionRow: React.FC<{
  question: any;
  idx: number;
  total: number;
  onToggle: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}> = ({ question, idx, total, onToggle, onDelete, onMoveUp, onMoveDown }) => {
  const meta = TYPE_META[question.type as QType] ?? TYPE_META.text;
  const text = question.translations?.[0]?.text || "Untitled";
  // Source badge: library questions show "📚 Library", template questions show the template name
  const sourceBadge = question.sourceTemplate
    ? null // template name shown as group header, not per-row
    : question.sourceQuestionId
      ? { label: "📚 Library", cls: "bg-indigo-50 text-indigo-600" }
      : null;

  return (
    <div
      className={`card p-4 flex items-center gap-3 transition-opacity ${!question.isActive ? "opacity-50" : ""}`}
    >
      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <button
          onClick={onMoveUp}
          disabled={idx === 0}
          className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs leading-none"
        >
          ▲
        </button>
        <span className="text-xs font-mono text-gray-300 text-center leading-none">
          {idx + 1}
        </span>
        <button
          onClick={onMoveDown}
          disabled={idx === total - 1}
          className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs leading-none"
        >
          ▼
        </button>
      </div>

      <div
        className={`flex-shrink-0 w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center text-sm`}
      >
        {meta.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm text-gray-800">{text}</p>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}
          >
            {meta.label}
          </span>
          {sourceBadge && (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${sourceBadge.cls}`}
            >
              {sourceBadge.label}
            </span>
          )}
          {question.fieldKey && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
              → {question.fieldKey}
            </span>
          )}
          {!question.isActive && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              Inactive
            </span>
          )}
        </div>
        {question.type === "choice" && question.options?.length > 0 && (
          <p className="text-xs text-gray-400 mt-0.5">
            {question.options.length} options
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onToggle}
          className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
        >
          {question.isActive ? "Disable" : "Enable"}
        </button>
        <button
          onClick={onDelete}
          className="text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
};

// ─── Library Slide-In Panel ───────────────────────────────────────────────────

const LibraryPanel: React.FC<{
  open: boolean;
  onClose: () => void;
  botId: string;
  jobId: string;
  onImported: () => void;
}> = ({ open, onClose, botId, jobId, onImported }) => {
  const [tab, setTab] = useState<"questions" | "templates">("questions");
  const [libraryQ, setLibraryQ] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !botId) return;
    setLoading(true);
    Promise.all([questionsApi.list({ botId }), templatesApi.list(botId)])
      .then(([qs, ts]) => {
        setLibraryQ(qs.filter((q: any) => !q.jobId));
        setTemplates(ts);
      })
      .finally(() => setLoading(false));
  }, [open, botId]);

  const importQuestion = async (qId: string) => {
    try {
      await templatesApi.applyQuestionToJob(qId, jobId);
      toast.success("Question added to job");
      onImported();
    } catch {
      toast.error("Failed to import");
    }
  };

  const importTemplate = async (templateId: string) => {
    try {
      const tmpl = templates.find((t: any) => t.id === templateId);
      await templatesApi.applyToJob(templateId, jobId);
      toast.success(
        `"${tmpl?.name}" applied — ${tmpl?.items?.length ?? "?"} questions added`,
      );
      onImported();
    } catch {
      toast.error("Failed to apply template");
    }
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col
        transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-bold text-gray-900">Question Library</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Import from your saved questions & templates
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors text-lg"
          >
            ×
          </button>
        </div>

        <div className="flex border-b border-gray-200 px-5 gap-4">
          {(["questions", "templates"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "questions"
                ? `Questions (${libraryQ.length})`
                : `Templates (${templates.length})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && (
            <p className="text-xs text-gray-400 text-center py-8">Loading…</p>
          )}

          {!loading && tab === "questions" && (
            <>
              {libraryQ.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-3xl mb-2">📭</p>
                  <p className="text-sm text-gray-500">
                    No library questions yet
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Create them in the Playground
                  </p>
                </div>
              )}
              {libraryQ.map((q: any) => {
                const meta = TYPE_META[q.type as QType] ?? TYPE_META.text;
                return (
                  <div
                    key={q.id}
                    className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl p-3 hover:border-blue-200 hover:shadow-sm transition-all"
                  >
                    <span
                      className={`flex-shrink-0 w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center text-sm mt-0.5`}
                    >
                      {meta.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 line-clamp-2">
                        {q.translations?.[0]?.text || "Untitled"}
                      </p>
                      <span
                        className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <button
                      onClick={() => importQuestion(q.id)}
                      className="flex-shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Add →
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {!loading && tab === "templates" && (
            <>
              {templates.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm text-gray-500">No templates yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Create them in the Playground
                  </p>
                </div>
              )}
              {templates.map((tmpl: any) => (
                <div
                  key={tmpl.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base">📋</span>
                        <p className="font-semibold text-gray-800 text-sm">
                          {tmpl.name}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {tmpl.items?.length ?? 0} questions
                      </p>
                      {tmpl.items?.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {tmpl.items.slice(0, 3).map((item: any) => {
                            const meta =
                              TYPE_META[item.question?.type as QType] ??
                              TYPE_META.text;
                            return (
                              <div
                                key={item.id}
                                className="flex items-center gap-1.5 text-xs text-gray-500"
                              >
                                <span>{meta.icon}</span>
                                <span className="truncate">
                                  {item.question?.translations?.[0]?.text ||
                                    "Untitled"}
                                </span>
                              </div>
                            );
                          })}
                          {tmpl.items.length > 3 && (
                            <p className="text-xs text-gray-400">
                              +{tmpl.items.length - 3} more…
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => importTemplate(tmpl.id)}
                      className="flex-shrink-0 text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Apply All →
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400">
            Questions are <strong>copied</strong> into the job — editing them in
            the library won't affect this job.
          </p>
        </div>
      </div>
    </>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const JobDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [bot, setBot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"translations" | "questions">("translations");
  const [translationForm, setTranslationForm] = useState<
    Record<string, { title: string; description: string }>
  >({});
  const [showAddQ, setShowAddQ] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([jobsApi.get(id), questionsApi.list({ jobId: id })])
      .then(async ([j, q]) => {
        setJob(j);
        setQuestions(q);
        const b = await botsApi.get(j.botId);
        setBot(b);
        const tf: any = {};
        j.translations.forEach((t: any) => {
          tf[t.lang] = { title: t.title, description: t.description };
        });
        setTranslationForm(tf);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const langs = bot?.languages || [];

  const handleSaveTranslations = async () => {
    if (!id) return;
    const translations = Object.entries(translationForm).map(
      ([lang, { title, description }]) => ({ lang, title, description }),
    );
    try {
      await jobsApi.update(id, { translations });
      toast.success("Translations saved");
    } catch {
      toast.error("Failed to save");
    }
  };

  const handleAddQuestion = async (formData: QFormState) => {
    if (!job) return;
    const translations = Object.entries(formData.translations)
      .filter(([, text]) => text)
      .map(([lang, text]) => ({ lang, text }));
    const options =
      formData.type === "choice"
        ? formData.options.map((opt, idx) => ({
            order: idx,
            translations: Object.entries(opt.translations)
              .filter(([, text]) => text)
              .map(([lang, text]) => ({ lang, text })),
          }))
        : [];
    const q = await questionsApi.create({
      botId: job.botId,
      jobId: id,
      type: formData.type,
      order: questions.length,
      fieldKey: formData.fieldKey || null,
      translations,
      options,
    });
    setQuestions((prev) => [...prev, q]);
    setShowAddQ(false);
    toast.success("Question added");
  };

  const handleImported = useCallback(async () => {
    if (!id) return;
    const q = await questionsApi.list({ jobId: id });
    setQuestions(q);
    setShowLibrary(false);
  }, [id]);

  const handleDeleteQuestion = async (qId: string) => {
    if (!confirm("Delete this question?")) return;
    await questionsApi.delete(qId);
    setQuestions((prev) => prev.filter((q) => q.id !== qId));
    toast.success("Question deleted");
  };

  const handleToggleQuestion = async (q: any) => {
    await questionsApi.update(q.id, { isActive: !q.isActive });
    setQuestions((prev) =>
      prev.map((x) => (x.id === q.id ? { ...x, isActive: !x.isActive } : x)),
    );
  };

  const handleMoveQuestion = async (qId: string, dir: 1 | -1) => {
    const sorted = [...questions].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((q) => q.id === qId);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    [sorted[idx], sorted[newIdx]] = [sorted[newIdx], sorted[idx]];
    const reordered = sorted.map((q, i) => ({ ...q, order: i }));
    setQuestions(reordered);
    try {
      await questionsApi.reorder(
        reordered.map((q) => ({ id: q.id, order: q.order })),
      );
    } catch {
      toast.error("Failed to reorder");
    }
  };

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>;
  if (!job) return <div className="p-8 text-gray-400">Job not found</div>;

  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);

  return (
    <>
      <div className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <Link
            to="/jobs"
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            ← Jobs
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">
            {job.translations?.[0]?.title || "Untitled Job"}
          </h1>
        </div>

        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {(["translations", "questions"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t}
              {t === "questions" && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                  {questions.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Translations ── */}
        {tab === "translations" && (
          <div className="space-y-4 max-w-2xl">
            {langs.length === 0 && (
              <p className="text-gray-400 text-sm">
                No languages configured for this bot.
              </p>
            )}
            {langs.map((lang: any) => {
              const tf = translationForm[lang.code] || {
                title: "",
                description: "",
              };
              return (
                <div key={lang.code} className="card p-5">
                  <h3 className="font-medium text-gray-800 mb-3">
                    {lang.name} ({lang.code})
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="label">Title</label>
                      <input
                        type="text"
                        value={tf.title}
                        className="input"
                        placeholder="Job title…"
                        onChange={(e) =>
                          setTranslationForm((prev) => ({
                            ...prev,
                            [lang.code]: { ...tf, title: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Description</label>
                      <textarea
                        value={tf.description}
                        className="input"
                        rows={3}
                        placeholder="Job description…"
                        onChange={(e) =>
                          setTranslationForm((prev) => ({
                            ...prev,
                            [lang.code]: { ...tf, description: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <button className="btn-primary" onClick={handleSaveTranslations}>
              Save Translations
            </button>
          </div>
        )}

        {/* ── Questions ── */}
        {tab === "questions" && (
          <div className="max-w-3xl">
            {/* Action bar */}
            <div className="flex items-center justify-between mb-4 gap-3">
              <p className="text-sm text-gray-500">
                {sortedQuestions.length} question
                {sortedQuestions.length !== 1 ? "s" : ""} in this survey
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowLibrary(true);
                    setShowAddQ(false);
                  }}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 bg-white px-3 py-2 rounded-xl transition-all"
                >
                  📚 From Library
                </button>
                <button
                  onClick={() => {
                    setShowAddQ((v) => !v);
                    setShowLibrary(false);
                  }}
                  className="btn-primary text-sm"
                >
                  {showAddQ ? "× Cancel" : "+ Quick Add"}
                </button>
              </div>
            </div>

            {/* Quick-add form */}
            {showAddQ && (
              <div className="card p-6 mb-5 border-blue-200 bg-blue-50/30">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">⚡</span>
                  <h3 className="font-semibold text-gray-800">
                    Quick Add Question
                  </h3>
                  <span className="text-xs text-gray-400 ml-auto">
                    Added directly to this job
                  </span>
                </div>
                <QuestionForm
                  langs={langs}
                  submitLabel="Add to Job"
                  onSubmit={handleAddQuestion}
                  onCancel={() => setShowAddQ(false)}
                />
              </div>
            )}

            {/* Empty state */}
            {sortedQuestions.length === 0 && !showAddQ && (
              <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-sm font-medium text-gray-600">
                  No questions yet
                </p>
                <p className="text-xs text-gray-400 mt-1 mb-4">
                  Add questions directly or import from the library
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setShowAddQ(true)}
                    className="btn-primary text-sm"
                  >
                    + Quick Add
                  </button>
                  <button
                    onClick={() => setShowLibrary(true)}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    or browse library →
                  </button>
                </div>
              </div>
            )}

            {/* Question list — grouped by source template, then library, then manual */}
            <div className="space-y-4">
              {(() => {
                // Build groups: {templateId|'library'|'manual' -> {label, questions[]}}
                const groups = new Map<
                  string,
                  { label: string; isTemplate: boolean; questions: any[] }
                >();
                for (const q of sortedQuestions) {
                  const key = q.sourceTemplateId
                    ? q.sourceTemplateId
                    : q.sourceQuestionId
                      ? "library"
                      : "manual";
                  if (!groups.has(key)) {
                    groups.set(key, {
                      label:
                        q.sourceTemplate?.name ??
                        (q.sourceQuestionId ? "Library" : "Direct"),
                      isTemplate: !!q.sourceTemplateId,
                      questions: [],
                    });
                  }
                  groups.get(key)!.questions.push(q);
                }

                return Array.from(groups.entries()).map(([key, group]) => (
                  <div key={key}>
                    {/* Group header — only when there are multiple groups or it's a template/library */}
                    {(groups.size > 1 ||
                      group.isTemplate ||
                      key === "library") && (
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          {group.isTemplate
                            ? `📋 ${group.label}`
                            : key === "library"
                              ? "📚 Library"
                              : "✏️ Direct"}
                        </span>
                        <div className="flex-1 h-px bg-gray-100" />
                        <span className="text-xs text-gray-300">
                          {group.questions.length}q
                        </span>
                      </div>
                    )}
                    <div className="space-y-2">
                      {group.questions.map((q) => {
                        const idx = sortedQuestions.indexOf(q);
                        return (
                          <QuestionRow
                            key={q.id}
                            question={q}
                            idx={idx}
                            total={sortedQuestions.length}
                            onToggle={() => handleToggleQuestion(q)}
                            onDelete={() => handleDeleteQuestion(q.id)}
                            onMoveUp={() => handleMoveQuestion(q.id, -1)}
                            onMoveDown={() => handleMoveQuestion(q.id, 1)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Legend */}
            {sortedQuestions.length > 0 && (
              <div className="mt-6 flex items-center gap-4 text-xs text-gray-400">
                <span className="font-medium">Types:</span>
                {(
                  Object.entries(TYPE_META) as [
                    QType,
                    (typeof TYPE_META)[QType],
                  ][]
                ).map(([k, m]) => (
                  <span key={k} className="flex items-center gap-1">
                    {m.icon} {m.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Library panel */}
      <LibraryPanel
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        botId={job?.botId || ""}
        jobId={id || ""}
        onImported={handleImported}
      />
    </>
  );
};
