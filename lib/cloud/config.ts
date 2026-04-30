/**
 * Server-side cloud-sync configuration. All values read at call time so
 * tests can override via env stubs without re-importing the module.
 *
 * No CORS allow-list — the API runs in the same Next.js app as the SPA, so
 * requests are same-origin by definition.
 */

export const MONGO_URI = process.env.MONGO_URI ?? "";
export const MONGO_DB = process.env.MONGO_DB ?? "riskmatrix";
export const MONGO_COLLECTION = process.env.MONGO_COLLECTION ?? "matrices";

/** Hard cap on ciphertext bytes per record. Mirrored client-side. */
export const MAX_CIPHERTEXT_BYTES = Number(
  process.env.MAX_CIPHERTEXT_BYTES ?? 256 * 1024,
);

/** Days before an inactive record is purged. */
export const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 90);

/** Per-IP request budget for write endpoints (window: 1 minute). */
export const WRITE_RATE_LIMIT_PER_MIN = Number(
  process.env.WRITE_RATE_LIMIT_PER_MIN ?? 30,
);
