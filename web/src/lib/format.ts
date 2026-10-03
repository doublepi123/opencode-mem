import { getLanguage } from "./i18n";

export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const lang = getLanguage();
  const locale = lang === "zh" ? "zh-CN" : lang === "ar" ? "ar-SA" : "en-US";
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.substring(0, max)}...` : text;
}
