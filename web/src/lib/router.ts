import { appPath, stripBase } from "./base-path";
import {
  normalizePath,
  pathForView,
  resolveAppPath,
  ROUTES,
  type AppView,
  viewFromPath,
} from "./routes";

let currentPath = resolveAppPath(
  typeof window !== "undefined" ? stripBase(window.location.pathname) : ROUTES.project
);
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setPath(next: string) {
  if (currentPath === next) return;
  currentPath = next;
  emit();
}

export function subscribePath(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPath(): string {
  return currentPath;
}

/** True when a click should be handled as in-app SPA navigation. */
export function shouldHandleSpaClick(event: MouseEvent): boolean {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

export function navigate(to: string, replace = false) {
  const next = resolveAppPath(to);
  if (normalizePath(stripBase(window.location.pathname)) === next) {
    setPath(next);
    return;
  }
  const url = appPath(next);
  if (replace) window.history.replaceState({}, "", url);
  else window.history.pushState({}, "", url);
  setPath(next);
}

export function navigateView(view: AppView, replace = false) {
  navigate(pathForView(view), replace);
}

export function currentView(): AppView {
  return viewFromPath(
    typeof window !== "undefined" ? stripBase(window.location.pathname) : currentPath
  );
}

/** Sync store with history; `/` and unknown paths resolve to project memories. */
export function initRouter(): () => void {
  const sync = () => {
    const current = normalizePath(stripBase(window.location.pathname));
    const resolved = resolveAppPath(current);
    if (current !== resolved) {
      window.history.replaceState({}, "", appPath(resolved));
    }
    setPath(resolved);
  };

  sync();
  window.addEventListener("popstate", sync);
  return () => window.removeEventListener("popstate", sync);
}

export { ROUTES, pathForView, viewFromPath };
export type { AppView };
