/**
 * Single source of truth for where the browser sends API requests.
 *
 * Every client-side fetch in this app goes through `API_BASE`. Nothing may
 * hardcode a host: a localhost URL baked into a bundle is inlined at build time
 * and breaks the moment the app is served from anywhere but a developer laptop.
 *
 * The default is same-origin (`/compass/api`), which Next's `rewrites()`
 * forwards to FastAPI server-side. That keeps browser traffic on one origin, so
 * there is no CORS to configure and the backend needs no public exposure.
 *
 * Set `NEXT_PUBLIC_API_URL` only to point the browser at a *different* origin
 * than the one serving the app. It is read at build time, so it must be supplied
 * as a build argument, not at container start.
 */

/** Mirrors `basePath` in next.config.ts. Both must change together. */
export const BASE_PATH = "/compass";

function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    // Trailing slash would double up when callers append "/scans".
    return configured.replace(/\/+$/, "");
  }
  return `${BASE_PATH}/api`;
}

export const API_BASE = resolveApiBase();
