/**
 * Server-side cloud-sync configuration, read from the environment at call
 * time so `vi.stubEnv` works in tests.
 *
 * Storage settings live with the storage code: `SQLITE_PATH` in
 * `sqliteStore.mts` and `RETENTION_DAYS` in `cleanup.mts`, because the
 * maintenance scripts load those files directly with Node.
 *
 * No CORS allow-list: the API is served from the same origin as the SPA, so
 * requests are same-origin by definition.
 */

/** Hard cap on ciphertext bytes per record. Mirrored client-side. */
export function getMaxCiphertextBytes(): number {
  return Number(process.env.MAX_CIPHERTEXT_BYTES ?? 256 * 1024);
}

/**
 * Per-IP request budget for write endpoints (window: 1 minute).
 *
 * The append path debounces local edits by 300ms client-side, so a
 * single fast typer caps around 200 POSTs/min in practice. We budget
 * 240/min (4/sec) per IP — comfortably above one user, and a multi-tab
 * user from the same IP gets shared headroom too.
 */
export function getWriteRateLimitPerMin(): number {
  return Number(process.env.WRITE_RATE_LIMIT_PER_MIN ?? 240);
}
