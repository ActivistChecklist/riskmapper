/**
 * Public configuration for the cloud-sync feature.
 *
 * The API is served from the same origin as the app, so all client requests
 * use relative URLs. Two env vars adjust behaviour:
 *
 *   - `VITE_CLOUD_SYNC_ENABLED` (default true) — set to "false" to hide all
 *     share affordances. Useful for deployments without a database.
 *   - `VITE_CLOUD_API_URL` (default empty) — optional override for the API
 *     base, e.g. when running the SPA against a remote API. Must be an
 *     absolute URL. Tests use this to assert outgoing URLs.
 *
 * Read from `import.meta.env` rather than `process.env`: this module runs in
 * the browser, where `process` does not exist. Vite inlines anything matching
 * the `VITE_` prefix at build time (see `envPrefix` in vite.config.ts). Both
 * are read at call time so tests can override via `vi.stubEnv`.
 */

/** Hard-cap ciphertext size on the wire. Mirrors server-side cap. */
export const MAX_CIPHERTEXT_BYTES = 256 * 1024;

/** Days before an unread + unwritten record is purged on the server. */
export const RETENTION_DAYS = 90;

export function isCloudEnabled(): boolean {
  return import.meta.env.VITE_CLOUD_SYNC_ENABLED !== "false";
}

export function cloudUrl(path: string): string {
  const override = (import.meta.env.VITE_CLOUD_API_URL ?? "").replace(/\/$/, "");
  return override + (path.startsWith("/") ? path : "/" + path);
}
