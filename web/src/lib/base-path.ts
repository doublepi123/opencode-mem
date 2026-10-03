/**
 * Base-path helpers for serving the dashboard under a URL sub-path.
 *
 * The default build keeps `base: "/""` (root deployment, upstream behavior).
 * A fork deployment build can set `OPENCODE_MEM_WEB_BASE=/mem/` so the Vite
 * base matches the public URL prefix stripped by a reverse proxy (nginx
 * `location /mem/` → backend root). `import.meta.env.BASE_URL` bakes the
 * value into the bundle at build time.
 */

/** Normalized build-time base: always starts with "/" and ends with "/". */
export const APP_BASE_URL: string = normalizeBase(import.meta.env.BASE_URL);

function normalizeBase(base: string | undefined): string {
  if (!base) return "/";
  let value = base.trim();
  if (!value) return "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (!value.endsWith("/")) value = `${value}/`;
  return value;
}

/** True when the app is built for a sub-path deployment. */
export function hasAppBase(): boolean {
  return APP_BASE_URL !== "/";
}

/**
 * Prefix an absolute app path (`/api/...`, `/project-memories`) with the
 * build-time base without producing double slashes. Paths that are already
 * absolute URLs (http(s)://, //host) or relative are returned unchanged.
 */
export function appPath(path: string): string {
  if (!path) return path;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return path; // absolute URL (http:, data:, ...)
  if (path.startsWith("//")) return path; // protocol-relative
  if (!path.startsWith("/")) return path; // relative — leave to the caller
  if (APP_BASE_URL === "/") return path;
  return `${APP_BASE_URL}${path.slice(1)}`;
}

/**
 * Remove the build-time base prefix from a pathname (e.g. from
 * `window.location.pathname`) so the router sees plain app paths.
 * Unknown prefixes are returned unchanged.
 */
export function stripBase(pathname: string): string {
  if (APP_BASE_URL === "/") return pathname;
  if (pathname === APP_BASE_URL) return "/";
  const prefix = APP_BASE_URL.slice(0, -1); // compare without trailing slash
  if (
    pathname.startsWith(prefix) &&
    (pathname.length === prefix.length || pathname[prefix.length] === "/")
  ) {
    return pathname.slice(prefix.length) || "/";
  }
  return pathname;
}
