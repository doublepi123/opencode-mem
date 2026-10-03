import { getPath, subscribePath, viewFromPath, type AppView } from "./router";

/** Reactive path/view for Svelte components. */
export function createRouter() {
  let path = $state(getPath());

  $effect(() => {
    return subscribePath(() => {
      path = getPath();
    });
  });

  return {
    get path() {
      return path;
    },
    get view(): AppView {
      return viewFromPath(path);
    },
  };
}
