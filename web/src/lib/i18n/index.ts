import { translations, type Lang, type TranslationKey } from "./translations";

const LANGS = Object.keys(translations) as Lang[];

export type TranslateFn = (
  key: TranslationKey | string,
  params?: Record<string, string | number>
) => string;

function readLang(): Lang {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem("opencode-mem-lang");
  if (stored && stored in translations) return stored as Lang;
  return "en";
}

let currentLang: Lang = readLang();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function applyLang(lang: Lang) {
  currentLang = lang;
  if (typeof document !== "undefined") {
    localStorage.setItem("opencode-mem-lang", lang);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }
  emit();
}

export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLanguage(): Lang {
  return currentLang;
}

export function setLanguage(lang: Lang) {
  applyLang(lang);
}

export function cycleLanguage(): Lang {
  const next = LANGS[(LANGS.indexOf(getLanguage()) + 1) % LANGS.length];
  setLanguage(next);
  return next;
}

export function t(
  key: TranslationKey | string,
  params: Record<string, string | number> = {},
  lang: Lang = getLanguage()
): string {
  let text =
    (translations[lang] as Record<string, string>)[key] ||
    (translations.en as Record<string, string>)[key] ||
    key;

  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return text;
}

if (typeof document !== "undefined") {
  document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = currentLang;
}
