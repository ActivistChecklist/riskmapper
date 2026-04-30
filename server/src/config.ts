export const PORT = Number(process.env.PORT ?? 8080);
export const MONGO_URI = process.env.MONGO_URI ?? "";
export const MONGO_DB = process.env.MONGO_DB ?? "riskmatrix";
export const MONGO_COLLECTION = process.env.MONGO_COLLECTION ?? "matrices";

/** Hard cap on ciphertext bytes per record. Mirrored client-side. */
export const MAX_CIPHERTEXT_BYTES = Number(process.env.MAX_CIPHERTEXT_BYTES ?? 256 * 1024);

/** Days before an inactive record is purged. */
export const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 90);

/**
 * Allow-list of origins for CORS. Comma-separated. Required: a deployer who
 * forgets to set this would otherwise ship an API responding to every
 * origin's simple GETs. We fail fast at app construction to prevent that.
 *
 * Evaluated lazily (function, not a top-level constant) so test harnesses can
 * import `createApp` without forcing CORS_ALLOW_ORIGINS to be set in the
 * test environment.
 */
export function getCorsAllowOrigins(): string[] {
  const raw = (process.env.CORS_ALLOW_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (raw.length === 0) {
    throw new Error(
      "CORS_ALLOW_ORIGINS must list at least one origin (e.g. https://activistchecklist.github.io). Refusing to start with no allow-list.",
    );
  }
  return raw;
}

/** Per-IP request budget for write endpoints (window: 1 minute). */
export const WRITE_RATE_LIMIT_PER_MIN = Number(
  process.env.WRITE_RATE_LIMIT_PER_MIN ?? 30,
);
