/**
 * Playground.tsx — Question management with branching
 *
 * Architecture notes:
 * - QuestionCard and BranchSection are mutually recursive.
 *   Both use `function` declarations (hoisted) so neither needs a
 *   forward-reference variable.
 * - All state lives in PlaygroundPage; callbacks flow down.
 * - Create/edit uses a single scrollable modal — no fake multi-step nav.
 * - Language inputs are shown stacked (all at once), not hidden behind tabs.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { botsApi, questionsApi } from "../api";
import toast from "react-hot-toast";
import { useT } from "../i18n";
import { useConfirm } from "../components/ConfirmModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type QType = "text" | "choice" | "attachment";

interface Lang {
  code: string;
  name: string;
}

interface Translation {
  lang: string;
  text: string;
  successMessage?: string | null;
  errorMessage?: string | null;
  phoneButtonText?: string | null;
}
interface QOption {
  id?: string;
  order: number;
  isActive?: boolean;
  branchId?: string | null;
  translations: { lang: string; text: string }[];
}
interface Question {
  id: string;
  botId?: string;
  type: QType;
  order?: number;
  isRequired?: boolean;
  fieldKey?: string | null;
  filterLabel?: string | null;
  parentOptionId?: string | null;
  branchOrder?: number | null;
  translations: Translation[];
  options: QOption[];
}

// ─── Meta / helpers ────────────────────────────────────────────────────────────

interface TypeMeta {
  icon: string;
  label: string;
  desc: string;
  color: string;
  bg: string;
  border: string;
}

const TYPE_STYLE: Record<QType, { icon: string; color: string; bg: string; border: string }> = {
  text: { icon: "✏️", color: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200" },
  choice: { icon: "☑️", color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200" },
  attachment: { icon: "📎", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
};

function getTypeMeta(t: (k: string) => string): Record<QType, TypeMeta> {
  return {
    text: { ...TYPE_STYLE.text, label: t("playground.typeText"), desc: t("playground.typeTextDesc") },
    choice: { ...TYPE_STYLE.choice, label: t("playground.typeChoice"), desc: t("playground.typeChoiceDesc") },
    attachment: { ...TYPE_STYLE.attachment, label: t("playground.typeFile"), desc: t("playground.typeFileDesc") },
  };
}

function getRequiredMeta(t: (k: string) => string): Record<string, { label: string; hint?: string }> {
  return {
    fullName: { label: t("playground.fieldFullName") },
    age: { label: t("playground.fieldAge"), hint: t("playground.fieldAgeHint") },
    phone: { label: t("playground.fieldPhone"), hint: t("playground.fieldPhoneHint") },
    profilePhoto: { label: t("playground.fieldProfilePhoto") },
    position: { label: t("playground.fieldPosition") },
    branch: { label: t("playground.fieldBranch"), hint: t("playground.fieldBranchHint") },
  };
}

function qText(q: Question): string {
  return q.translations[0]?.text || "";
}

function optText(opt: QOption, preferLang?: string): string {
  if (preferLang) {
    return (
      opt.translations.find((t) => t.lang === preferLang)?.text ||
      opt.translations[0]?.text ||
      ""
    );
  }
  return opt.translations[0]?.text || "";
}

// ─── Shared: Language row inputs ──────────────────────────────────────────────
// Shows all language inputs stacked vertically — no hidden tabs.

function LangInputs({
  langs,
  values,
  onChange,
  placeholder,
  multiline = false,
  inputRef,
}: {
  langs: Lang[];
  values: Record<string, string>;
  onChange: (lang: string, val: string) => void;
  placeholder?: (lang: Lang) => string;
  multiline?: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement | HTMLInputElement>;
}) {
  return (
    <div className="space-y-2">
      {langs.map((l, idx) => {
        const val = values[l.code] || "";
        const ph = placeholder ? placeholder(l) : `${l.name}…`;
        const missingOther =
          langs.some((x) => x.code !== l.code && values[x.code]?.trim()) &&
          !val.trim();
        return (
          <div key={l.code} className="flex gap-2 items-start">
            <span
              className={`flex-shrink-0 text-xs font-semibold font-mono mt-2.5 w-7 text-right ${
                val.trim()
                  ? "text-gray-500"
                  : missingOther
                    ? "text-amber-500"
                    : "text-gray-300"
              }`}
            >
              {l.code}
            </span>
            {multiline ? (
              <textarea
                ref={
                  idx === 0
                    ? (inputRef as React.RefObject<HTMLTextAreaElement>)
                    : undefined
                }
                value={val}
                onChange={(e) => onChange(l.code, e.target.value)}
                rows={2}
                className="input flex-1 text-sm resize-none"
                placeholder={ph}
              />
            ) : (
              <input
                ref={
                  idx === 0
                    ? (inputRef as React.RefObject<HTMLInputElement>)
                    : undefined
                }
                value={val}
                onChange={(e) => onChange(l.code, e.target.value)}
                className="input flex-1 text-sm"
                placeholder={ph}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Question Create / Edit Modal ─────────────────────────────────────────────
// Single scrollable form — no fake multi-step navigation.

function QuestionModal({
  mode,
  langs,
  botId,
  question,
  parentOptionId,
  parentOptionLabel,
  existingCount = 0,
  onSave,
  onClose,
}: {
  mode: "create" | "edit";
  langs: Lang[];
  botId: string;
  question?: Question;
  parentOptionId?: string;
  parentOptionLabel?: string;
  existingCount?: number;
  onSave: (q: Question) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const isEdit = mode === "edit";
  const isRequired = !!question?.isRequired;
  const isPhone = question?.fieldKey === "phone";
  const isBranch = question?.fieldKey === "branch";
  const isBranchCreate = !!parentOptionId;

  // ── form state ──
  const [type, setType] = useState<QType>(question?.type || "text");
  const [texts, setTexts] = useState<Record<string, string>>(
    Object.fromEntries(
      langs.map((l) => [
        l.code,
        question?.translations.find((t) => t.lang === l.code)?.text || "",
      ]),
    ),
  );
  const [successMsgs, setSuccessMsgs] = useState<Record<string, string>>(
    Object.fromEntries(
      langs.map((l) => [
        l.code,
        question?.translations.find((t) => t.lang === l.code)?.successMessage ||
          "",
      ]),
    ),
  );
  const [errorMsgs, setErrorMsgs] = useState<Record<string, string>>(
    Object.fromEntries(
      langs.map((l) => [
        l.code,
        question?.translations.find((t) => t.lang === l.code)?.errorMessage ||
          "",
      ]),
    ),
  );
  const [phoneLabels, setPhoneLabels] = useState<Record<string, string>>(
    Object.fromEntries(
      langs.map((l) => [
        l.code,
        question?.translations.find((t) => t.lang === l.code)
          ?.phoneButtonText || "",
      ]),
    ),
  );
  const [options, setOptions] = useState<
    { translations: Record<string, string> }[]
  >(
    question?.options.map((o) => ({
      translations: Object.fromEntries(
        langs.map((l) => [
          l.code,
          o.translations.find((t) => t.lang === l.code)?.text || "",
        ]),
      ),
    })) || [],
  );
  const [filterLabel, setFilterLabel] = useState(question?.filterLabel || "");
  const [showMessages, setShowMessages] = useState(false);
  const [saving, setSaving] = useState(false);
  // Branch option active states (keyed by option id)
  const [branchOptionStates, setBranchOptionStates] = useState<
    Record<string, boolean>
  >(
    Object.fromEntries(
      (question?.options || [])
        .filter((o) => o.id)
        .map((o) => [o.id!, o.isActive !== false]),
    ),
  );
  const [togglingOption, setTogglingOption] = useState<string | null>(null);

  const firstRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => (firstRef.current as HTMLElement)?.focus(), 60);
    return () => clearTimeout(id);
  }, []);


  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  // translation completeness
  const hasMissingText =
    langs.some((l) => !texts[l.code]?.trim()) &&
    langs.some((l) => texts[l.code]?.trim());
  const hasNoText = langs.every((l) => !texts[l.code]?.trim());
  const hasEnoughOpts =
    type !== "choice" ||
    isBranch ||
    options.filter((o) => langs.some((l) => o.translations[l.code]?.trim()))
      .length >= 1;

  const canSave = !hasNoText && hasEnoughOpts;

  async function handleSave() {
    if (!canSave) {
      if (hasNoText) {
        toast.error(t("playground.addTextFirst"));
        return;
      }
      if (!hasEnoughOpts) {
        toast.error(t("playground.addOptionFirst"));
        return;
      }
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        ...(isEdit
          ? {}
          : {
              botId,
              order: existingCount,
              parentOptionId: parentOptionId || null,
              branchOrder: existingCount,
            }),
        ...(isRequired ? {} : { type }),
        filterLabel:
          type === "choice" && filterLabel.trim() ? filterLabel.trim() : null,
        translations: langs
          .filter((l) => texts[l.code]?.trim())
          .map((l) => ({
            lang: l.code,
            text: texts[l.code].trim(),
            successMessage: successMsgs[l.code]?.trim() || null,
            errorMessage: errorMsgs[l.code]?.trim() || null,
            phoneButtonText: isPhone
              ? phoneLabels[l.code]?.trim() || null
              : null,
          })),
        ...(!isBranch && {
          options:
            type === "choice"
              ? options.map((o, i) => ({
                  order: i,
                  translations: langs
                    .filter((l) => o.translations[l.code]?.trim())
                    .map((l) => ({
                      lang: l.code,
                      text: o.translations[l.code].trim(),
                    })),
                }))
              : [],
        }),
      };
      const saved = isEdit
        ? await questionsApi.update(question!.id, payload)
        : await questionsApi.create(payload);
      onSave(saved);
      toast.success(isEdit ? t("playground.questionSaved") : t("playground.questionAdded"));
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t("playground.failedToSave"));
    }
    setSaving(false);
  }

  function addOption() {
    setOptions((o) => [
      ...o,
      { translations: Object.fromEntries(langs.map((l) => [l.code, ""])) },
    ]);
  }
  function removeOption(i: number) {
    setOptions((o) => o.filter((_, j) => j !== i));
  }
  async function toggleBranchOption(optionId: string, newActive: boolean) {
    if (!question?.id) return;
    setTogglingOption(optionId);
    try {
      await questionsApi.toggleOption(question.id, optionId, newActive);
      setBranchOptionStates((prev) => ({ ...prev, [optionId]: newActive }));
      // Update the parent's question data so the card reflects the change
      const updatedQ = {
        ...question,
        options: question.options.map((o) =>
          o.id === optionId ? { ...o, isActive: newActive } : o,
        ),
      };
      onSave(updatedQ);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t("playground.failedToToggle"));
    }
    setTogglingOption(null);
  }

  function setOptLang(i: number, lang: string, val: string) {
    setOptions((o) =>
      o.map((x, j) =>
        j !== i
          ? x
          : { ...x, translations: { ...x.translations, [lang]: val } },
      ),
    );
  }

  const TYPE_META = getTypeMeta(t);
  const m = TYPE_META[type];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? t("playground.editQuestion") : t("playground.createQuestion")}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-gray-900 leading-snug">
                {isEdit
                  ? isRequired
                    ? t("playground.editRequiredQuestion")
                    : t("playground.editQuestion")
                  : isBranchCreate
                    ? t("playground.addQuestion")
                    : t("playground.addQuestion")}
              </h2>
              {isBranchCreate && parentOptionLabel && (
                <p className="text-xs text-violet-600 mt-0.5 truncate">
                  ↳ {t("playground.shownWhenPicks")}{" "}
                  <strong>"{parentOptionLabel}"</strong>
                </p>
              )}
              {isEdit && qText(question!) && (
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                  {qText(question!)}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Type picker — hidden for required questions */}
          {!isRequired && (
            <div
              className="grid grid-cols-3 gap-2 mt-4"
              role="group"
              aria-label="Question type"
            >
              {(
                Object.entries(TYPE_META) as [
                  QType,
                  (typeof TYPE_META)[QType],
                ][]
              ).map(([t, meta]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                    if (t !== "choice") setOptions([]);
                  }}
                  aria-pressed={type === t}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all text-left ${
                    type === t
                      ? `${meta.border} ${meta.bg} ${meta.color}`
                      : "border-gray-100 text-gray-500 hover:border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-base leading-none">{meta.icon}</span>
                  <span className="leading-tight">
                    {meta.label}
                    <span className="block font-normal text-[10px] opacity-60 mt-0.5">
                      {meta.desc}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Scrollable form body ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
          {/* Question text */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {t("playground.questionText")}
              {hasMissingText && (
                <span className="ml-2 font-normal text-amber-500 normal-case tracking-normal">
                  · {t("playground.missingIn")}{" "}
                  {langs
                    .filter((l) => !texts[l.code]?.trim())
                    .map((l) => l.name)
                    .join(", ")}
                </span>
              )}
            </label>
            <LangInputs
              langs={langs}
              values={texts}
              onChange={(lang, val) => setTexts((t) => ({ ...t, [lang]: val }))}
              placeholder={(l) => t("playground.askInLang").replace("{{lang}}", l.name)}
              multiline
              inputRef={firstRef as React.RefObject<HTMLTextAreaElement>}
            />
          </div>

          {/* Phone button label */}
          {isPhone && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {t("playground.buttonLabel")}
                <span className="ml-1 font-normal text-gray-400 normal-case tracking-normal">
                  — {t("playground.sharePhoneButtonHint")}
                </span>
              </label>
              <LangInputs
                langs={langs}
                values={phoneLabels}
                onChange={(lang, val) =>
                  setPhoneLabels((t) => ({ ...t, [lang]: val }))
                }
                placeholder={() => t("playground.sharePhoneNumber")}
              />
            </div>
          )}

          {/* Attachment note */}
          {type === "attachment" && (
            <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 text-sm text-emerald-700">
              <span className="text-xl leading-none mt-0.5">📎</span>
              <div>
                <p className="font-semibold text-sm">{t("playground.fileUploadTitle")}</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  {t("playground.fileUploadDesc")}
                </p>
              </div>
            </div>
          )}

          {/* Branch options — toggle only, no editing */}
          {type === "choice" && isBranch && isEdit && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                {t("playground.branchOptions")}
                <span className="ml-1 font-normal text-gray-400 normal-case tracking-normal">
                  — {t("playground.branchToggleHint")}
                </span>
              </label>
              {question!.options.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-3">
                  {t("playground.noBranchesFound")}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {question!.options.map((opt) => {
                    const label =
                      opt.translations.find((t) => t.lang === langs[0]?.code)
                        ?.text ||
                      opt.translations[0]?.text ||
                      "—";
                    const active = branchOptionStates[opt.id!] ?? true;
                    const toggling = togglingOption === opt.id;
                    return (
                      <div
                        key={opt.id}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
                          active
                            ? "bg-white border-gray-200"
                            : "bg-gray-50 border-gray-100"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              active ? "bg-green-400" : "bg-gray-300"
                            }`}
                          />
                          <span
                            className={`text-sm font-medium truncate ${
                              active ? "text-gray-800" : "text-gray-400 line-through"
                            }`}
                          >
                            {label}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={toggling}
                          onClick={() =>
                            opt.id && toggleBranchOption(opt.id, !active)
                          }
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                            active ? "bg-green-500" : "bg-gray-300"
                          } ${toggling ? "opacity-50" : ""}`}
                          aria-label={`${active ? t("playground.disable") : t("playground.enable")}: ${label}`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                              active ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">
                {t("playground.branchDisabledHint")}
              </p>
            </div>
          )}

          {/* Options — choice only (not for branch questions) */}
          {type === "choice" && !isBranch && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("playground.answerOptions")}
                  {options.length === 0 && (
                    <span className="ml-2 font-normal text-red-400 normal-case tracking-normal">
                      · {t("playground.required").toLowerCase()}
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={addOption}
                  className="text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors"
                >
                  {t("playground.addOption")}
                </button>
              </div>

              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-400">
                        {t("playground.optionN").replace("{{n}}", String(i + 1))}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeOption(i)}
                        className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors rounded"
                        aria-label={t("playground.removeOptionN").replace("{{n}}", String(i + 1))}
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                    <LangInputs
                      langs={langs}
                      values={opt.translations}
                      onChange={(lang, val) => setOptLang(i, lang, val)}
                      placeholder={(l) => t("playground.optionInLang").replace("{{n}}", String(i + 1)).replace("{{lang}}", l.name)}
                    />
                  </div>
                ))}

                {options.length === 0 && (
                  <button
                    type="button"
                    onClick={addOption}
                    className="w-full py-3 border-2 border-dashed border-violet-200 rounded-xl text-sm text-violet-400 hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                  >
                    {t("playground.addFirstOption")}
                  </button>
                )}
              </div>

              {/* Filter label */}
              <div className="mt-3">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
                  {t("playground.filterLabelTitle")}
                  <span className="ml-1 font-normal text-gray-400 normal-case tracking-normal">
                    — {t("playground.optional")}
                  </span>
                </label>
                <input
                  value={filterLabel}
                  onChange={(e) => setFilterLabel(e.target.value)}
                  className="input w-full text-sm"
                  placeholder={t("playground.filterLabelPlaceholder")}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {t("playground.filterLabelHint")}
                </p>
              </div>
            </div>
          )}

          {/* Response messages — collapsible */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowMessages((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
              aria-expanded={showMessages}
            >
              <span className="flex items-center gap-2">
                <span>💬</span>
                {t("playground.responseMessages")}
                <span className="font-normal text-gray-400">— {t("playground.optional")}</span>
              </span>
              <svg
                className={`w-3.5 h-3.5 transition-transform ${showMessages ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {showMessages && (
              <div className="px-4 pb-4 pt-1 space-y-4 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  {t("playground.customMessages")}
                </p>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">
                    ✅ {t("playground.afterValidAnswer")}
                  </label>
                  <LangInputs
                    langs={langs}
                    values={successMsgs}
                    onChange={(lang, val) =>
                      setSuccessMsgs((m) => ({ ...m, [lang]: val }))
                    }
                    placeholder={() => t("playground.validAnswerPlaceholder")}
                  />
                </div>
                {!isPhone && type !== "choice" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                      ❌ {t("playground.afterInvalidAnswer")}
                    </label>
                    <LangInputs
                      langs={langs}
                      values={errorMsgs}
                      onChange={(lang, val) =>
                        setErrorMsgs((m) => ({ ...m, [lang]: val }))
                      }
                      placeholder={() => t("playground.invalidAnswerPlaceholder")}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="btn-secondary text-sm py-2 px-4">
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="btn-primary text-sm py-2 px-5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? t("common.saving") : isEdit ? t("playground.saveChanges") : t("playground.addQuestion")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BranchSection + QuestionCard (mutually recursive via function hoisting) ──

interface SharedCardProps {
  langs: Lang[];
  allQuestions: Question[];
  botId: string;
  onUpdate: (q: Question) => void;
  onDelete: (id: string) => void;
  onAdd: (q: Question) => void;
}

// BranchSection — the indented panel shown below a choice option
function BranchSection({
  optionId,
  optionLabel,
  depth,
  langs,
  allQuestions,
  botId,
  onUpdate,
  onDelete,
  onAdd,
}: SharedCardProps & {
  optionId: string;
  optionLabel: string;
  depth: number;
}) {
  const { t } = useT();
  const [showCreate, setShowCreate] = useState(false);

  const branchQs = allQuestions
    .filter((q) => q.parentOptionId === optionId)
    .sort((a, b) => (a.branchOrder ?? 0) - (b.branchOrder ?? 0));

  async function move(q: Question, dir: "up" | "down") {
    const idx = branchQs.findIndex((x) => x.id === q.id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= branchQs.length) return;
    const sibling = branchQs[swapIdx];
    try {
      await questionsApi.reorderBranch([
        { id: q.id, branchOrder: swapIdx },
        { id: sibling.id, branchOrder: idx },
      ]);
      onUpdate({ ...q, branchOrder: swapIdx });
      onUpdate({ ...sibling, branchOrder: idx });
    } catch {
      toast.error(t("playground.failedToReorder"));
    }
  }

  // Depth-indexed left-border colors for visual nesting
  const accentColors = [
    "border-violet-300",
    "border-sky-300",
    "border-emerald-300",
    "border-amber-300",
  ];
  const accent = accentColors[depth % accentColors.length];

  return (
    <div className={`mt-2 pl-3 border-l-2 ${accent}`}>
      <p className="text-[11px] text-gray-400 mb-2 flex items-center gap-1.5">
        <span className="text-gray-300">↳</span>
        {t("playground.ifOptionAlsoAsk").replace("{{option}}", optionLabel)}
      </p>
      <div className="space-y-2">
        {branchQs.map((q, idx) => (
          <div key={q.id} className="flex gap-1.5 items-start">
            {/* Reorder arrows */}
            <div className="flex flex-col flex-shrink-0 mt-2 gap-0.5">
              <button
                onClick={() => move(q, "up")}
                disabled={idx === 0}
                className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded text-[10px] disabled:invisible transition-colors"
                aria-label={t("playground.moveUp")}
              >
                ▲
              </button>
              <button
                onClick={() => move(q, "down")}
                disabled={idx === branchQs.length - 1}
                className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded text-[10px] disabled:invisible transition-colors"
                aria-label={t("playground.moveDown")}
              >
                ▼
              </button>
            </div>
            <div className="flex-1 min-w-0">
              {/* QuestionCard is function-hoisted, safe to call here */}
              <QuestionCard
                question={q}
                depth={depth + 1}
                langs={langs}
                allQuestions={allQuestions}
                botId={botId}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAdd={onAdd}
              />
            </div>
          </div>
        ))}

        {branchQs.length === 0 && !showCreate && (
          <p className="text-xs text-gray-400 italic">
            {t("playground.noFollowUpYet")}
          </p>
        )}

        {/* Create button */}
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-violet-600 hover:bg-violet-50 px-2 py-1.5 rounded-lg transition-colors"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          {t("playground.addFollowUp")}
        </button>
      </div>

      {showCreate && (
        <QuestionModal
          mode="create"
          langs={langs}
          botId={botId}
          parentOptionId={optionId}
          parentOptionLabel={optionLabel}
          existingCount={branchQs.length}
          onSave={(q) => {
            onAdd(q);
            setShowCreate(false);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

// OptionsView — the in-card option list with branch expand toggles
function OptionsView({
  question,
  depth,
  langs,
  allQuestions,
  botId,
  onUpdate,
  onDelete,
  onAdd,
}: SharedCardProps & { question: Question; depth: number }) {
  const { t } = useT();
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (question.options.length === 0)
    return (
      <p className="text-xs text-red-400 mt-1">
        {t("playground.noOptionsClickEdit")}
      </p>
    );

  const primaryLang = langs[0]?.code;

  return (
    <div className="mt-2 space-y-1">
      {question.options.map((opt, i) => {
        const id = opt.id || `_${i}`;
        const label = optText(opt, primaryLang) || t("playground.optionN").replace("{{n}}", String(i + 1));
        const branchCount = allQuestions.filter(
          (q) => q.parentOptionId === opt.id,
        ).length;
        const isOpen = openIds.has(id);

        return (
          <div key={id}>
            <div className="flex items-center gap-2 group/opt py-0.5">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${opt.isActive === false ? "bg-gray-100" : "bg-gray-200"}`} />
              <span className={`text-sm flex-1 min-w-0 truncate ${opt.isActive === false ? "text-gray-300 line-through" : "text-gray-600"}`}>
                {label}
                {opt.isActive === false && (
                  <span className="ml-1.5 text-[10px] text-gray-300 no-underline font-medium">{t("playground.optionDisabled")}</span>
                )}
              </span>
              {opt.id && (
                <button
                  onClick={() => toggle(id)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors flex-shrink-0 ${
                    branchCount > 0
                      ? isOpen
                        ? "bg-violet-100 text-violet-700 border-violet-200"
                        : "bg-violet-50 text-violet-600 border-violet-100 hover:bg-violet-100"
                      : "border-transparent text-gray-300 hover:text-violet-500 hover:bg-violet-50 hover:border-violet-100"
                  }`}
                  aria-expanded={isOpen}
                  title={
                    branchCount > 0
                      ? t("playground.followUpCount").replace("{{count}}", String(branchCount))
                      : t("playground.addFollowUps")
                  }
                >
                  <span>↳</span>
                  {branchCount > 0 ? (
                    <span>{branchCount}</span>
                  ) : (
                    <span>{t("playground.branchLabel").toLowerCase()}</span>
                  )}
                </button>
              )}
            </div>

            {isOpen && opt.id && (
              <BranchSection
                optionId={opt.id}
                optionLabel={label}
                depth={depth}
                langs={langs}
                allQuestions={allQuestions}
                botId={botId}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAdd={onAdd}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// QuestionCard — unified card for both required and custom questions (view-only)
// Editing always opens QuestionModal.
function QuestionCard({
  question,
  depth = 0,
  canReorder,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  langs,
  allQuestions,
  botId,
  onUpdate,
  onDelete,
  onAdd,
}: SharedCardProps & {
  question: Question;
  depth?: number;
  canReorder?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const { t } = useT();
  const [showEdit, setShowEdit] = useState(false);
  const { confirm, element: confirmEl } = useConfirm();
  const TYPE_META = getTypeMeta(t);
  const REQUIRED_META = getRequiredMeta(t);
  const meta = TYPE_META[question.type];
  const isRequired = !!question.isRequired;
  const isBranch = !!question.parentOptionId;
  const reqMeta =
    isRequired && question.fieldKey ? REQUIRED_META[question.fieldKey] : null;

  // preview of response messages
  const tr0 = question.translations[0];
  const hasMessages = !!(tr0?.successMessage || tr0?.errorMessage);

  async function handleDelete() {
    const ok = await confirm({
      title: t("playground.deleteThisQuestion"),
      message: t("playground.deleteQuestionMsg"),
      danger: true,
      confirmLabel: t("playground.deleteConfirm"),
    });
    if (!ok) return;
    try {
      await questionsApi.delete(question.id);
      onDelete(question.id);
      toast.success(t("playground.questionDeleted"));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t("playground.failedToDelete"));
    }
  }

  const cardCls =
    depth > 0
      ? "bg-gray-50 rounded-xl border border-gray-200 p-3"
      : isRequired
        ? "bg-white rounded-xl border-2 border-blue-100 p-4"
        : "bg-white rounded-xl border border-gray-200 hover:border-gray-300 p-4 transition-colors";

  return (
    <>
      {confirmEl}
      <div className={cardCls}>
        <div className="flex items-start gap-3">
          {/* Reorder handles */}
          {canReorder && (
            <div className="flex flex-col flex-shrink-0 mt-0.5 gap-0.5">
              <button
                onClick={onMoveUp}
                disabled={isFirst}
                className="w-5 h-5 flex items-center justify-center text-gray-200 hover:text-gray-600 hover:bg-gray-100 rounded text-[10px] disabled:invisible transition-colors"
                aria-label={t("playground.moveUp")}
              >
                ▲
              </button>
              <button
                onClick={onMoveDown}
                disabled={isLast}
                className="w-5 h-5 flex items-center justify-center text-gray-200 hover:text-gray-600 hover:bg-gray-100 rounded text-[10px] disabled:invisible transition-colors"
                aria-label={t("playground.moveDown")}
              >
                ▼
              </button>
            </div>
          )}

          {/* Type icon */}
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-base ${
              isRequired ? "bg-blue-50" : meta.bg
            }`}
          >
            {isRequired ? "🔒" : meta.icon}
          </div>

          {/* Body */}
          <div className="flex-1 min-w-0">
            {/* Tag row */}
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              {isRequired ? (
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {t("playground.required")}
                </span>
              ) : (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}
                >
                  {meta.label}
                </span>
              )}
              {isBranch && (
                <span className="text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                  ↳ {t("playground.branchLabel")}
                </span>
              )}
              {question.filterLabel && (
                <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  🔽 {question.filterLabel}
                </span>
              )}
              {reqMeta && (
                <span className="text-xs text-gray-400">{reqMeta.label}</span>
              )}
            </div>

            {/* Question text */}
            <p
              className={`text-sm font-medium ${qText(question) ? "text-gray-800" : "text-gray-300 italic"}`}
            >
              {qText(question) || t("playground.noTextYet")}
            </p>

            {/* Required field hint */}
            {reqMeta?.hint && (
              <p className="text-xs text-amber-500 mt-0.5">{reqMeta.hint}</p>
            )}

            {/* Options with branch toggles */}
            {question.type === "choice" && (
              <OptionsView
                question={question}
                depth={depth + 1}
                langs={langs}
                allQuestions={allQuestions}
                botId={botId}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAdd={onAdd}
              />
            )}

            {/* Response message previews */}
            {hasMessages && (
              <div className="mt-1.5 flex flex-wrap gap-3">
                {tr0?.successMessage && (
                  <span className="text-xs text-gray-400 truncate max-w-[200px]">
                    ✅ "{tr0.successMessage}"
                  </span>
                )}
                {tr0?.errorMessage && (
                  <span className="text-xs text-gray-400 truncate max-w-[200px]">
                    ❌ "{tr0.errorMessage}"
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setShowEdit(true)}
              className="px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label={t("playground.editQuestion")}
            >
              {t("playground.editQuestion")}
            </button>
            {!isRequired && (
              <button
                onClick={handleDelete}
                className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                aria-label={t("playground.deleteQuestion")}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {showEdit && (
        <QuestionModal
          mode="edit"
          langs={langs}
          botId={botId}
          question={question}
          onSave={onUpdate}
          onClose={() => setShowEdit(false)}
        />
      )}
    </>
  );
}

// ─── Section divider ──────────────────────────────────────────────────────────

function SectionHeader({
  title,
  note,
  action,
}: {
  title: string;
  note: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">
        {title}
      </h2>
      <div className="flex-1 h-px bg-gray-100" />
      {note && (
        <span className="text-xs text-gray-400 whitespace-nowrap">{note}</span>
      )}
      {action}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export const PlaygroundPage: React.FC = () => {
  const { t } = useT();
  const [bots, setBots] = useState<any[]>([]);
  const [selectedBotId, setSelectedBotId] = useState("");
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    botsApi.list().then((b: any[]) => {
      setBots(b);
      if (b.length > 0) setSelectedBotId(b[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedBotId) return;
    setLoading(true);
    questionsApi
      .list({ botId: selectedBotId })
      .then((qs: Question[]) => setAllQuestions(qs))
      .finally(() => setLoading(false));
  }, [selectedBotId]);

  const selectedBot = bots.find((b) => b.id === selectedBotId);
  const langs: Lang[] = selectedBot?.languages || [];

  const requiredQuestions = allQuestions
    .filter((q) => q.isRequired && !q.parentOptionId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const customQuestions = allQuestions
    .filter((q) => !q.isRequired && !q.parentOptionId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const branchCount = allQuestions.filter((q) => q.parentOptionId).length;

  const updateQuestion = useCallback(
    (updated: Question) =>
      setAllQuestions((prev) =>
        prev.map((q) => (q.id === updated.id ? { ...q, ...updated } : q)),
      ),
    [],
  );

  const deleteQuestion = useCallback(
    (id: string) =>
      setAllQuestions((prev) => {
        const gone = new Set([id]);
        let changed = true;
        while (changed) {
          changed = false;
          prev.forEach((q) => {
            if (q.parentOptionId && !gone.has(q.id)) {
              const owner = prev.find((pq) =>
                pq.options.some((o) => o.id === q.parentOptionId),
              );
              if (owner && gone.has(owner.id)) {
                gone.add(q.id);
                changed = true;
              }
            }
          });
        }
        return prev.filter((q) => !gone.has(q.id));
      }),
    [],
  );

  const addQuestion = useCallback(
    (q: Question) => setAllQuestions((prev) => [...prev, q]),
    [],
  );

  async function moveRequired(q: Question, dir: "up" | "down") {
    const idx = requiredQuestions.findIndex((x) => x.id === q.id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= requiredQuestions.length) return;
    const sibling = requiredQuestions[swapIdx];
    try {
      await questionsApi.reorder([
        { id: q.id, order: swapIdx },
        { id: sibling.id, order: idx },
      ]);
      updateQuestion({ ...q, order: swapIdx });
      updateQuestion({ ...sibling, order: idx });
    } catch {
      toast.error(t("playground.failedToReorder"));
    }
  }

  async function moveCustom(q: Question, dir: "up" | "down") {
    const idx = customQuestions.findIndex((x) => x.id === q.id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= customQuestions.length) return;
    const sibling = customQuestions[swapIdx];
    try {
      await questionsApi.reorder([
        { id: q.id, order: swapIdx },
        { id: sibling.id, order: idx },
      ]);
      updateQuestion({ ...q, order: swapIdx });
      updateQuestion({ ...sibling, order: idx });
    } catch {
      toast.error(t("playground.failedToReorder"));
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100 px-8 py-3.5">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div>
            <h1 className="text-base font-bold text-gray-900">
              {t("playground.questionPlayground")}
            </h1>
            {!loading && selectedBotId && (
              <p className="text-xs text-gray-400 mt-0.5 leading-none">
                {t("playground.nRequired").replace("{{n}}", String(requiredQuestions.length))}
                {customQuestions.length > 0 &&
                  ` · ${t("playground.nCustom").replace("{{n}}", String(customQuestions.length))}`}
                {branchCount > 0 && ` · ${t("playground.nBranch").replace("{{n}}", String(branchCount))}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <select
              value={selectedBotId}
              onChange={(e) => setSelectedBotId(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 max-w-[160px]"
            >
              {bots.length === 0 && <option value="">{t("playground.noBots")}</option>}
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {selectedBotId && !loading && (
              <button
                onClick={() => setShowCreate(true)}
                className="btn-primary text-sm py-2 px-3.5 flex items-center gap-1.5"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                {t("playground.addQuestion")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-8 py-6 max-w-2xl mx-auto">
        {/* Loading */}
        {loading && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-2xl mb-3 animate-pulse">⚙️</p>
            <p className="text-sm">{t("playground.loadingQuestions")}</p>
          </div>
        )}

        {/* No bot */}
        {!loading && !selectedBotId && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-3xl mb-3">🤖</p>
            <p className="text-sm font-medium text-gray-500">
              {t("playground.noBotsConfigured")}
            </p>
            <p className="text-xs mt-1">{t("playground.addBotFirst")}</p>
          </div>
        )}

        {!loading && selectedBotId && (
          <div className="space-y-8">
            {/* ── Required questions ── */}
            <section aria-label={t("playground.requiredQuestions")}>
              <SectionHeader
                title={t("playground.requiredQuestions")}
                note={t("playground.alwaysAskedFirst")}
              />
              <div className="space-y-2">
                {requiredQuestions.map((q, idx) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    depth={0}
                    canReorder={requiredQuestions.length > 1}
                    onMoveUp={() => moveRequired(q, "up")}
                    onMoveDown={() => moveRequired(q, "down")}
                    isFirst={idx === 0}
                    isLast={idx === requiredQuestions.length - 1}
                    langs={langs}
                    allQuestions={allQuestions}
                    botId={selectedBotId}
                    onUpdate={updateQuestion}
                    onDelete={deleteQuestion}
                    onAdd={addQuestion}
                  />
                ))}
              </div>
            </section>

            {/* ── Custom questions ── */}
            <section aria-label={t("playground.additionalQuestions")}>
              <SectionHeader
                title={t("playground.additionalQuestions")}
                note={t("playground.additionalNote")}
              />

              {customQuestions.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
                  <p className="text-3xl mb-3">💬</p>
                  <p className="text-sm font-semibold text-gray-700 mb-1">
                    {t("playground.noAdditionalYet")}
                  </p>
                  <p className="text-xs text-gray-400 mb-5 max-w-xs mx-auto">
                    {t("playground.noAdditionalDesc")}
                  </p>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="btn-primary text-sm py-2 px-5"
                  >
                    {t("playground.addFirstQuestion")}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {customQuestions.map((q, idx) => (
                    <QuestionCard
                      key={q.id}
                      question={q}
                      depth={0}
                      canReorder={customQuestions.length > 1}
                      onMoveUp={() => moveCustom(q, "up")}
                      onMoveDown={() => moveCustom(q, "down")}
                      isFirst={idx === 0}
                      isLast={idx === customQuestions.length - 1}
                      langs={langs}
                      allQuestions={allQuestions}
                      botId={selectedBotId}
                      onUpdate={updateQuestion}
                      onDelete={deleteQuestion}
                      onAdd={addQuestion}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <QuestionModal
          mode="create"
          langs={langs}
          botId={selectedBotId}
          existingCount={customQuestions.length}
          onSave={(q) => {
            addQuestion(q);
            setShowCreate(false);
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
};
