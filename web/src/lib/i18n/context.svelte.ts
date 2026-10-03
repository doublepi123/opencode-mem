import { getContext, setContext } from "svelte";
import { createI18n } from "./i18n.svelte";

const I18N_KEY = Symbol("opencode-mem-i18n");

type I18nApi = ReturnType<typeof createI18n>;

export function setI18nContext(): I18nApi {
  const i18n = createI18n();
  setContext(I18N_KEY, i18n);
  return i18n;
}

export function useI18n(): I18nApi {
  const i18n = getContext<I18nApi | undefined>(I18N_KEY);
  if (!i18n) {
    throw new Error("useI18n() requires setI18nContext() in a parent component");
  }
  return i18n;
}

export { createI18n };
