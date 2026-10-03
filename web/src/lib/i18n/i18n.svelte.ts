import { getLanguage, subscribeLanguage, t, type TranslateFn } from "./index";

/** Reactive language + translate helper for Svelte components. */
export function createI18n() {
  let language = $state(getLanguage());

  $effect(() => {
    return subscribeLanguage(() => {
      language = getLanguage();
    });
  });

  return {
    get language() {
      return language;
    },
    t: ((key, params = {}) => t(key, params, language)) as TranslateFn,
  };
}
