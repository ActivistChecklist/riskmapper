/**
 * Deletes shared matrices nobody has opened or edited for `RETENTION_DAYS`
 * days, with their updates, and sweeps any update rows left without a
 * matrix. Run daily by `scripts/sqlite-cleanup.mts`.
 *
 * This is what MongoDB's TTL index on `lastActivityDate` used to do, plus
 * the orphan sweep that `scripts/cleanup-orphan-updates.mjs` ran after it.
 * The Security page promises the deletion (`RETENTION_DAYS` in
 * `components/risk-matrix/cloudConfig.ts`), so if this stops running,
 * that promise stops being true.
 *
 * Loaded directly by Node; see the import rule at the top of
 * `sqliteStore.mts`.
 */
import type { DatabaseSync } from "node:sqlite";
import { inTransaction, truncateWal } from "./sqliteStore.mts";

export const DEFAULT_RETENTION_DAYS = 90;

export function retentionDaysFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.RETENTION_DAYS;
  if (raw === undefined || raw === "") return DEFAULT_RETENTION_DAYS;
  const days = Number(raw);
  // Zero or a typo must not turn into "delete everything not touched today".
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`RETENTION_DAYS must be a whole number of days, at least 1 (got ${JSON.stringify(raw)})`);
  }
  return days;
}

/**
 * The latest `lastActivityDate` that is old enough to delete. Matches the
 * TTL index it replaces, which removed a record once `lastActivityDate`
 * (midnight UTC of its last active day) plus the retention period had
 * passed: last active on day D, deleted from day D + 90 on.
 */
export function idleCutoffDay(now: Date, retentionDays: number): string {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff.toISOString().slice(0, 10);
}

export type CleanupResult = {
  cutoffDay: string;
  matrices: number;
  updates: number;
  orphanUpdates: number;
  /** False if another connection kept the WAL from being truncated. Harmless; the next run retries. */
  walTruncated: boolean;
};

export function cleanupDatabase(
  db: DatabaseSync,
  opts: { retentionDays: number; now?: Date },
): CleanupResult {
  const cutoffDay = idleCutoffDay(opts.now ?? new Date(), opts.retentionDays);
  const counts = inTransaction(db, () => {
    // Updates first, by hand rather than through ON DELETE CASCADE, only so
    // the count is accurate: SQLite does not report cascaded deletions.
    const updates = db
      .prepare(
        "DELETE FROM matrix_updates WHERE recordId IN (SELECT id FROM matrices WHERE lastActivityDate <= ?)",
      )
      .run(cutoffDay).changes;
    const matrices = db
      .prepare("DELETE FROM matrices WHERE lastActivityDate <= ?")
      .run(cutoffDay).changes;
    // The foreign key makes orphans impossible through the app, but not
    // through a connection with foreign keys off, such as the sqlite3 shell
    // by default.
    const orphanUpdates = db
      .prepare("DELETE FROM matrix_updates WHERE recordId NOT IN (SELECT id FROM matrices)")
      .run().changes;
    return {
      matrices: Number(matrices),
      updates: Number(updates),
      orphanUpdates: Number(orphanUpdates),
    };
  });
  // secure_delete has already zeroed the deleted rows in their pages, but
  // earlier copies of those pages can sit in the WAL until it is reused.
  // Checkpointing and truncating it removes them, including any left by a
  // "Stop sharing" whose own truncate was skipped. This job may wait for it.
  return { cutoffDay, ...counts, walTruncated: truncateWal(db, { wait: true }) };
}
