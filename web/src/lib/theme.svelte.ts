import { getTheme, subscribeTheme } from "./theme";

/** Reactive theme for Svelte components. */
export function createTheme() {
  let theme = $state(getTheme());

  $effect(() => {
    return subscribeTheme(() => {
      theme = getTheme();
    });
  });

  return {
    get theme() {
      return theme;
    },
  };
}
