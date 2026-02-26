import React, { useEffect, useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { botsApi, questionsApi, templatesApi, jobsApi } from "../api";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type QType = "text" | "choice" | "attachment";

interface Translation {
  lang: string;
  text: string;
}
interface OptionTrans {
  lang: string;
  text: string;
}
interface QOption {
  id?: string;
  order: number;
  translations: OptionTrans[];
}

interface Question {
  id: string;
  type: QType;
  fieldKey?: string | null;
  translations: Translation[];
  options: QOption[];
  jobId?: string | null;
}

interface TemplateItem {
  id: string;
  order: number;
  questionId: string;
  question: Question;
}

interface Template {
  id: string;
  name: string;
  items: TemplateItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_META: Record<
  QType,
  { icon: string; label: string; color: string; bg: string; border: string }
> = {
  text: {
    icon: "✏️",
    label: "Text",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-300",
  },
  choice: {
    icon: "☑️",
    label: "Choice",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-300",
  },
  attachment: {
    icon: "📎",
    label: "Attachment",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-300",
  },
};

const FIELD_KEYS = ["", "fullName", "age", "phone", "email"];

function qText(q: Question) {
  return q.translations[0]?.text || "Untitled question";
}

// ─── Question Card (draggable in Library) ─────────────────────────────────────

const LibraryCard: React.FC<{
  question: Question;
  onEdit: (q: Question) => void;
  onDelete: (id: string) => void;
}> = ({ question, onEdit, onDelete }) => {
  const meta = TYPE_META[question.type];
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `lib-${question.id}`,
      data: { source: "library", question },
    });

  const style = transform
    ? { transform: `translate(${transform.x}px,${transform.y}px)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative bg-white rounded-xl border-2 ${meta.border} p-4 transition-all duration-150
        ${isDragging ? "opacity-30" : "shadow-sm hover:shadow-md"}`}
    >
      {/* Drag handle */}
      <div
        {...listeners}
        {...attributes}
        className="absolute top-3 right-3 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors"
        title="Drag to template"
      >
        ⠿
      </div>

      <div className="flex items-start gap-3 pr-6">
        <span
          className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center text-sm`}
        >
          {meta.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
            {qText(question)}
          </p>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}
            >
              {meta.label}
            </span>
            {question.fieldKey && (
              <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                → {question.fieldKey}
              </span>
            )}
            {question.type === "choice" && question.options.length > 0 && (
              <span className="text-xs text-gray-400">
                {question.options.length} options
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions on hover */}
      <div className="absolute bottom-2 right-2 hidden group-hover:flex gap-1">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onEdit(question)}
          className="text-xs text-gray-400 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
        >
          Edit
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(question.id)}
          className="text-xs text-gray-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
};

// ─── Template Item (inside template, reorderable) ─────────────────────────────

const TemplateItemCard: React.FC<{
  item: TemplateItem;
  idx: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}> = ({ item, idx, total, onMoveUp, onMoveDown, onRemove }) => {
  const q = item.question;
  const meta = TYPE_META[q.type];
  return (
    <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2 group">
      {/* Reorder arrows */}
      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <button
          onClick={onMoveUp}
          disabled={idx === 0}
          className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs"
        >
          ▲
        </button>
        <button
          onClick={onMoveDown}
          disabled={idx === total - 1}
          className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs"
        >
          ▼
        </button>
      </div>

      <span
        className={`flex-shrink-0 w-6 h-6 rounded ${meta.bg} flex items-center justify-center text-xs`}
      >
        {meta.icon}
      </span>

      <p className="flex-1 text-xs font-medium text-gray-700 truncate">
        {qText(q)}
      </p>

      <span
        className={`text-xs px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color} flex-shrink-0`}
      >
        {meta.label}
      </span>

      <button
        onClick={onRemove}
        className="hidden group-hover:block text-gray-300 hover:text-red-500 ml-1 flex-shrink-0 text-sm leading-none"
      >
        ×
      </button>
    </div>
  );
};

// ─── Template Card (droppable container) ──────────────────────────────────────

const TemplateCard: React.FC<{
  template: Template;
  jobs: any[];
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMoveItem: (templateId: string, itemId: string, dir: 1 | -1) => void;
  onRemoveItem: (templateId: string, itemId: string) => void;
  onApplyToJob: (templateId: string, jobId: string) => void;
}> = ({
  template,
  jobs,
  onRename,
  onDelete,
  onMoveItem,
  onRemoveItem,
  onApplyToJob,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: `tmpl-${template.id}` });
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(template.name);
  const [showJobPicker, setShowJobPicker] = useState(false);

  const commitRename = () => {
    setEditing(false);
    if (nameVal.trim() && nameVal !== template.name)
      onRename(template.id, nameVal.trim());
  };

  return (
    <div
      className={`bg-gray-50 rounded-2xl border-2 transition-colors duration-150
      ${isOver ? "border-blue-400 bg-blue-50/40" : "border-gray-200"}`}
    >
      {/* Template header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        <span className="text-lg">📋</span>
        {editing ? (
          <input
            autoFocus
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => e.key === "Enter" && commitRename()}
            className="flex-1 text-sm font-semibold bg-white border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex-1 text-left text-sm font-semibold text-gray-800 hover:text-blue-600 transition-colors"
            title="Click to rename"
          >
            {template.name}
          </button>
        )}
        <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
          {template.items.length} questions
        </span>

        {/* Apply to Job */}
        <div className="relative">
          <button
            onClick={() => setShowJobPicker((v) => !v)}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors"
          >
            Apply to Job →
          </button>
          {showJobPicker && (
            <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-xl shadow-xl z-50 min-w-[200px] py-1">
              <p className="text-xs text-gray-400 px-3 py-1.5 border-b border-gray-100">
                Select a job
              </p>
              {jobs.length === 0 && (
                <p className="text-xs text-gray-400 px-3 py-2">
                  No jobs available
                </p>
              )}
              {jobs.map((j) => (
                <button
                  key={j.id}
                  onClick={() => {
                    onApplyToJob(template.id, j.id);
                    setShowJobPicker(false);
                  }}
                  className="w-full text-left text-sm text-gray-700 hover:bg-gray-50 px-3 py-2 truncate"
                >
                  {j.translations?.[0]?.title || "Untitled"}
                </button>
              ))}
              <button
                onClick={() => setShowJobPicker(false)}
                className="w-full text-left text-xs text-gray-400 px-3 py-1.5 hover:bg-gray-50 border-t border-gray-100"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            if (confirm("Delete this template?")) onDelete(template.id);
          }}
          className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Items */}
      <div ref={setNodeRef} className="p-3 space-y-1.5 min-h-[80px]">
        {template.items.length === 0 && (
          <div
            className={`text-center text-xs py-6 rounded-xl border-2 border-dashed transition-colors
            ${isOver ? "border-blue-300 text-blue-400 bg-blue-50/60" : "border-gray-200 text-gray-300"}`}
          >
            {isOver
              ? "✓ Drop here to add question"
              : "Drag questions from the library here"}
          </div>
        )}
        {template.items.map((item, idx) => (
          <TemplateItemCard
            key={item.id}
            item={item}
            idx={idx}
            total={template.items.length}
            onMoveUp={() => onMoveItem(template.id, item.id, -1)}
            onMoveDown={() => onMoveItem(template.id, item.id, 1)}
            onRemove={() => onRemoveItem(template.id, item.id)}
          />
        ))}
        {template.items.length > 0 && (
          <div
            className={`text-center text-xs py-2 rounded-xl border-2 border-dashed transition-colors
            ${isOver ? "border-blue-300 text-blue-400" : "border-gray-100 text-gray-200"}`}
          >
            {isOver ? "Add here" : ""}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Question form (create / edit) ────────────────────────────────────────────

const QuestionForm: React.FC<{
  langs: { code: string; name: string }[];
  initial?: Question;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}> = ({ langs, initial, onSave, onCancel }) => {
  const [type, setType] = useState<QType>(initial?.type || "text");
  const [fieldKey, setFieldKey] = useState(initial?.fieldKey || "");
  const [translations, setTranslations] = useState<Record<string, string>>(
    () => {
      const m: Record<string, string> = {};
      initial?.translations.forEach((t) => {
        m[t.lang] = t.text;
      });
      return m;
    },
  );
  const [options, setOptions] = useState<
    { translations: Record<string, string> }[]
  >(
    () =>
      initial?.options.map((o) => {
        const m: Record<string, string> = {};
        o.translations.forEach((t) => {
          m[t.lang] = t.text;
        });
        return { translations: m };
      }) || [],
  );
  const [saving, setSaving] = useState(false);

  const choiceError =
    type === "choice" && options.length === 0
      ? "Add at least one option for a choice question."
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (choiceError) return;
    setSaving(true);
    try {
      await onSave({
        type,
        fieldKey: fieldKey || null,
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type selector */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
          Type
        </label>
        <div className="flex gap-2">
          {(["text", "choice", "attachment"] as QType[]).map((t) => {
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
        {type === "attachment" && (
          <p className="text-xs text-emerald-600 mt-1.5 bg-emerald-50 px-3 py-1.5 rounded-lg">
            📎 Candidate will be asked to send a file, photo, or document.
          </p>
        )}
      </div>

      {/* Question text per language */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
          Question Text
        </label>
        {langs.length === 0 && (
          <p className="text-xs text-gray-400">
            No languages configured for this bot.
          </p>
        )}
        {langs.map((lang) => (
          <div key={lang.code} className="flex gap-2 mb-2">
            <span className="text-xs font-mono bg-gray-100 px-2 py-2 rounded-lg w-10 text-center text-gray-500 flex-shrink-0">
              {lang.code}
            </span>
            <input
              type="text"
              value={translations[lang.code] || ""}
              onChange={(e) =>
                setTranslations((p) => ({ ...p, [lang.code]: e.target.value }))
              }
              className="input flex-1"
              placeholder={`Question in ${lang.name}`}
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
              onClick={() => setOptions((o) => [...o, { translations: {} }])}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
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
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
              {langs.map((lang) => (
                <div key={lang.code} className="flex gap-2">
                  <span className="text-xs font-mono bg-white border border-gray-200 px-2 py-1.5 rounded w-10 text-center text-gray-500 flex-shrink-0">
                    {lang.code}
                  </span>
                  <input
                    type="text"
                    value={opt.translations[lang.code] || ""}
                    onChange={(e) =>
                      setOptions((o) => {
                        const n = [...o];
                        n[idx] = {
                          ...n[idx],
                          translations: {
                            ...n[idx].translations,
                            [lang.code]: e.target.value,
                          },
                        };
                        return n;
                      })
                    }
                    className="input flex-1 text-sm"
                    placeholder={`Option in ${lang.name}`}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Field key */}
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
          Maps to Profile Field{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <select
          value={fieldKey}
          onChange={(e) => setFieldKey(e.target.value)}
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
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={saving || !!choiceError}
          className="btn-primary flex-1 disabled:opacity-50"
        >
          {saving ? "Saving…" : initial ? "Update Question" : "Create Question"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
};

// ─── Main Playground Page ─────────────────────────────────────────────────────

export const PlaygroundPage: React.FC = () => {
  const [bots, setBots] = useState<any[]>([]);
  const [selectedBotId, setSelectedBotId] = useState("");
  const [libraryQuestions, setLibraryQuestions] = useState<Question[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Form panel state
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // New template form
  const [newTemplateName, setNewTemplateName] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  // DnD
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Load bots on mount
  useEffect(() => {
    botsApi.list().then((b) => {
      setBots(b);
      if (b.length > 0) setSelectedBotId(b[0].id);
    });
  }, []);

  // Load library, templates, jobs when bot changes
  useEffect(() => {
    if (!selectedBotId) return;
    setLoading(true);
    Promise.all([
      questionsApi.list({ botId: selectedBotId }),
      templatesApi.list(selectedBotId),
      jobsApi.list(selectedBotId),
    ])
      .then(([qs, ts, js]) => {
        // Library = questions with no jobId
        setLibraryQuestions(qs.filter((q: any) => !q.jobId));
        setTemplates(ts);
        setJobs(js);
      })
      .finally(() => setLoading(false));
  }, [selectedBotId]);

  const selectedBot = bots.find((b) => b.id === selectedBotId);
  const langs = selectedBot?.languages || [];

  // ── Create / update question ──────────────────────────────────────────────

  const handleSaveQuestion = async (data: any) => {
    if (!selectedBotId) return;
    if (editingQuestion) {
      const updated = await questionsApi.update(editingQuestion.id, data);
      setLibraryQuestions((prev) =>
        prev.map((q) => (q.id === editingQuestion.id ? updated : q)),
      );
      // Also refresh template items that reference this question
      setTemplates((prev) =>
        prev.map((t) => ({
          ...t,
          items: t.items.map((item) =>
            item.questionId === editingQuestion.id
              ? { ...item, question: updated }
              : item,
          ),
        })),
      );
      toast.success("Question updated");
    } else {
      const created = await questionsApi.create({
        botId: selectedBotId,
        jobId: null,
        order: libraryQuestions.length,
        ...data,
      });
      setLibraryQuestions((prev) => [...prev, created]);
      toast.success("Question created");
    }
    setShowForm(false);
    setEditingQuestion(null);
  };

  const handleDeleteQuestion = async (id: string) => {
    if (
      !confirm(
        "Delete this question? It will also be removed from all templates.",
      )
    )
      return;
    await questionsApi.delete(id);
    setLibraryQuestions((prev) => prev.filter((q) => q.id !== id));
    setTemplates((prev) =>
      prev.map((t) => ({
        ...t,
        items: t.items.filter((item) => item.questionId !== id),
      })),
    );
    toast.success("Question deleted");
  };

  // ── Templates ─────────────────────────────────────────────────────────────

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim() || !selectedBotId) return;
    const t = await templatesApi.create({
      botId: selectedBotId,
      name: newTemplateName.trim(),
    });
    setTemplates((prev) => [...prev, t]);
    setNewTemplateName("");
    setCreatingTemplate(false);
    toast.success("Template created");
  };

  const handleRenameTemplate = async (id: string, name: string) => {
    await templatesApi.update(id, { name });
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
  };

  const handleDeleteTemplate = async (id: string) => {
    await templatesApi.delete(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast.success("Template deleted");
  };

  const handleRemoveTemplateItem = async (
    templateId: string,
    itemId: string,
  ) => {
    await templatesApi.removeItem(templateId, itemId);
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === templateId
          ? { ...t, items: t.items.filter((i) => i.id !== itemId) }
          : t,
      ),
    );
  };

  const handleMoveTemplateItem = async (
    templateId: string,
    itemId: string,
    dir: 1 | -1,
  ) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    const items = [...template.items].sort((a, b) => a.order - b.order);
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= items.length) return;
    // Swap
    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    const reordered = items.map((item, i) => ({ ...item, order: i }));
    setTemplates((prev) =>
      prev.map((t) => (t.id === templateId ? { ...t, items: reordered } : t)),
    );
    await templatesApi.reorderItems(
      templateId,
      reordered.map((i) => ({ id: i.id, order: i.order })),
    );
  };

  const handleApplyToJob = async (templateId: string, jobId: string) => {
    try {
      await templatesApi.applyToJob(templateId, jobId);
      const jobName =
        jobs.find((j) => j.id === jobId)?.translations?.[0]?.title || "job";
      toast.success(`Template applied to "${jobName}"`);
    } catch {
      toast.error("Failed to apply template");
    }
  };

  // ── DnD handlers ──────────────────────────────────────────────────────────

  const handleDragStart = (e: DragStartEvent) => {
    if (e.active.data.current?.source === "library") {
      setActiveQuestion(e.active.data.current.question);
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveQuestion(null);
    const { active, over } = e;
    if (!over) return;

    const overId = over.id as string;
    if (!overId.startsWith("tmpl-")) return;

    const templateId = overId.slice(5);
    const question: Question = active.data.current?.question;
    if (!question) return;

    // Check for duplicate
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    if (template.items.some((i) => i.questionId === question.id)) {
      toast("This question is already in this template", { icon: "ℹ️" });
      return;
    }

    try {
      const item = await templatesApi.addItem(templateId, question.id);
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === templateId ? { ...t, items: [...t.items, item] } : t,
        ),
      );
      toast.success("Added to template");
    } catch {
      toast.error("Failed to add question");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Question Playground
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Build a library of reusable questions and group them into templates
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Bot selector */}
          <select
            value={selectedBotId}
            onChange={(e) => setSelectedBotId(e.target.value)}
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
      </div>

      {/* Workspace — DndContext must wrap BOTH columns so useDraggable (left)
           and useDroppable (right) share the same context */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-hidden flex gap-0">
          {/* ── LEFT: Question Library ──────────────────────────────────────── */}
          <div className="w-80 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-bold text-gray-700">
                  Question Library
                </h2>
                <p className="text-xs text-gray-400">
                  {libraryQuestions.length} questions
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingQuestion(null);
                  setShowForm(true);
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                + New
              </button>
            </div>

            {/* Question form panel */}
            {showForm && (
              <div className="border-b border-gray-100 p-4 bg-blue-50/30">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  {editingQuestion ? "Edit Question" : "New Question"}
                </h3>
                <QuestionForm
                  langs={langs}
                  initial={editingQuestion || undefined}
                  onSave={handleSaveQuestion}
                  onCancel={() => {
                    setShowForm(false);
                    setEditingQuestion(null);
                  }}
                />
              </div>
            )}

            {/* Library list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loading && (
                <p className="text-xs text-gray-400 text-center py-8">
                  Loading…
                </p>
              )}
              {!loading && libraryQuestions.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-3xl mb-2">✏️</p>
                  <p className="text-sm text-gray-500 font-medium">
                    No questions yet
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Create your first question above
                  </p>
                </div>
              )}
              {libraryQuestions.map((q) => (
                <LibraryCard
                  key={q.id}
                  question={q}
                  onEdit={(q) => {
                    setEditingQuestion(q);
                    setShowForm(true);
                  }}
                  onDelete={handleDeleteQuestion}
                />
              ))}
            </div>

            {/* Drag tip */}
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                ⠿ Drag cards to add them to a template →
              </p>
            </div>
          </div>

          {/* ── RIGHT: Templates ────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* New template bar */}
            <div className="flex items-center gap-3 mb-5">
              <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                📋 Templates
                <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {templates.length}
                </span>
              </h2>
              {creatingTemplate ? (
                <div className="flex items-center gap-2 ml-auto">
                  <input
                    autoFocus
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateTemplate();
                      if (e.key === "Escape") setCreatingTemplate(false);
                    }}
                    placeholder="Template name…"
                    className="input w-48 text-sm"
                  />
                  <button
                    onClick={handleCreateTemplate}
                    className="btn-primary text-xs px-3 py-2"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setCreatingTemplate(false)}
                    className="btn-secondary text-xs px-3 py-2"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCreatingTemplate(true)}
                  className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  + New Template
                </button>
              )}
            </div>

            {!loading && templates.length === 0 && (
              <div className="text-center py-20 text-gray-400">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-sm font-medium text-gray-500">
                  No templates yet
                </p>
                <p className="text-xs mt-1">
                  Create a template and drag questions into it
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  jobs={jobs}
                  onRename={handleRenameTemplate}
                  onDelete={handleDeleteTemplate}
                  onMoveItem={handleMoveTemplateItem}
                  onRemoveItem={handleRemoveTemplateItem}
                  onApplyToJob={handleApplyToJob}
                />
              ))}
            </div>
          </div>

          {/* Drag overlay */}
          <DragOverlay dropAnimation={null}>
            {activeQuestion ? (
              <div
                className={`w-72 bg-white rounded-xl border-2 shadow-2xl p-4 rotate-2 opacity-95 pointer-events-none ${TYPE_META[activeQuestion.type].border}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`w-7 h-7 rounded-lg ${TYPE_META[activeQuestion.type].bg} flex items-center justify-center text-sm flex-shrink-0`}
                  >
                    {TYPE_META[activeQuestion.type].icon}
                  </span>
                  <p className="text-sm font-semibold text-gray-800 line-clamp-2">
                    {qText(activeQuestion)}
                  </p>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </div>
      </DndContext>
    </div>
  );
};
