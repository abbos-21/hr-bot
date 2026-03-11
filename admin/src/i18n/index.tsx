import React, { createContext, useContext, useState, useCallback } from "react";
import uz from "./uz.json";
import ru from "./ru.json";
import en from "./en.json";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Lang = "uz" | "ru" | "en";

const TRANSLATIONS: Record<Lang, Record<string, any>> = { uz, ru, en };
const STORAGE_KEY = "hr_admin_lang";
const DEFAULT_LANG: Lang = "uz";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolve a dot-notated key against a nested object */
function resolve(obj: Record<string, any>, key: string): string | undefined {
  const parts = key.split(".");
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Interpolate {{variable}} placeholders */
function interpolate(
  text: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`,
  );
}

function getSavedLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved && saved in TRANSLATIONS) return saved;
  } catch {}
  return DEFAULT_LANG;
}

// ── Context ───────────────────────────────────────────────────────────────────

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [lang, setLangState] = useState<Lang>(getSavedLang);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch {}
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const dict = TRANSLATIONS[lang];
      const fallback = TRANSLATIONS[DEFAULT_LANG];
      const text = resolve(dict, key) ?? resolve(fallback, key) ?? key;
      return interpolate(text, vars);
    },
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used inside I18nProvider");
  return ctx;
}

// ── Language metadata ─────────────────────────────────────────────────────────

export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: "uz", label: "O'zbek", flag: "🇺🇿" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "en", label: "English", flag: "🇬🇧" },
];
