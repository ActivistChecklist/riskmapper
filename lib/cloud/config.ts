/**
 * Server-side cloud-sync configuration. The two values most commonly
 * overridden in tests (`MAX_CIPHERTEXT_BYTES` and `WRITE_RATE_LIMIT_PER_MIN`)
 * are exposed as getter functions so `vi.stubEnv` works at call time. The
 * rest are module-load constants — they only matter for the Mongo
 * connection, which tests mock wholesale.
 *
 * No CORS allow-list — the API runs in the same Next.js app as the SPA, so
 * requests are same-origin by definition.
 */

export const MONGO_URI = process.env.MONGO_URI ?? "";
export const MONGO_DB = process.env.MONGO_DB ?? "riskmatrix";
export const MONGO_COLLECTION = process.env.MONGO_COLLECTION ?? "matrices";

/** Hard cap on ciphertext bytes per record. Mirrored client-side. */
export function getMaxCiphertextBytes(): number {
  return Number(process.env.MAX_CIPHERTEXT_BYTES ?? 256 * 1024);
}

/** Days before an inactive record is purged. */
export function getRetentionDays(): number {
  return Number(process.env.RETENTION_DAYS ?? 90);
}

/** Per-IP request budget for write endpoints (window: 1 minute). */
export function getWriteRateLimitPerMin(): number {
  return Number(process.env.WRITE_RATE_LIMIT_PER_MIN ?? 30);
}
