/**
 * Public configuration for the cloud-sync feature.
 *
 * Cloud sync is opt-in per matrix. When the API URL env var is empty the UI
 * hides all "Share to cloud" affordances entirely.
 *
 * The base URL is read at call time (not module load) so tests can override
 * via `vi.stubEnv`.
 */

/** Hard-cap ciphertext size on the wire. Mirrors server-side cap. */
export const MAX_CIPHERTEXT_BYTES = 256 * 1024;

/** Days before an unread + unwritten record is purged on the server. */
export const RETENTION_DAYS = 90;

export function getCloudApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_CLOUD_API_URL ?? "").replace(/\/$/, "");
}

export function isCloudEnabled(): boolean {
  return getCloudApiBaseUrl().length > 0;
}

export function cloudUrl(path: string): string {
  const base = getCloudApiBaseUrl();
  if (!base) {
    throw new Error(
      "Cloud sync is not configured. Set NEXT_PUBLIC_CLOUD_API_URL.",
    );
  }
  return base + (path.startsWith("/") ? path : "/" + path);
}
