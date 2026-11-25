/**
 * Stored matrix record. The server treats `baseline` and the `ciphertext`
 * of every update as opaque — it never decrypts. See `THREAT-MODEL.md`.
 *
 * The matrix is modeled as one immutable baseline (the encrypted Y.Doc
 * state-as-update at `baselineSeq`) plus an append-only log of encrypted
 * Y.Doc updates with monotonically-assigned `seq` ids. `headSeq` is the
 * highest seq the server has ever assigned for this record; the next
 * append takes `headSeq + 1`.
 */
export type MatrixDoc = {
  _id: string;
  baseline: string;
  baselineSeq: number;
  headSeq: number;
  createdDate: string;
  lastWriteDate: string;
  lastReadDate: string | null;
  /**
   * Midnight-UTC `Date` of the most recent read or write. The daily cleanup
   * (`lib/cloud/cleanup.mts`) deletes records whose last activity is
   * `RETENTION_DAYS` (90) days old. Stored as a `YYYY-MM-DD` column by
   * `sqliteStore.mts`, so it carries no time of day even if a caller passes
   * one: matches the "coarse calendar dates" promise in THREAT-MODEL.md.
   */
  lastActivityDate: Date;
  /**
   * SHA-256 of the write token, base64url. The token is derived from the
   * matrix key in the browser and proves the writer holds the link; see
   * `lib/cloud/writeAuth.ts`. Absent only on records created before write
   * authorization existed, until the first authenticated request claims
   * them.
   */
  writeHash?: string;
};

export type MatrixUpdate = {
  /**
   * Accepted on insert and never stored. Under MongoDB this was set
   * explicitly to `recordId:seq` because a driver-minted ObjectId embeds its
   * creation time to the second, which would have stamped a precise
   * wall-clock time on every edit. SQLite keys the row on `(recordId, seq)`
   * itself, which carries no time, and its table has no hidden rowid either
   * (see `sqliteStore.mts`). Nothing reads this field.
   */
  _id?: string;
  recordId: string;
  seq: number;
  ciphertext: string;
  clientId: string;
  /** UTC calendar date (`YYYY-MM-DD`). Coarse on purpose — see THREAT-MODEL.md. */
  createdAt: string;
};

/** The deterministic, time-free `_id` for an update row. */
export function updateRowId(recordId: string, seq: number): string {
  return `${recordId}:${seq}`;
}

/**
 * Storage surface for matrices, implemented over SQLite in
 * `sqliteStore.mts`. The method and operator names are MongoDB's, kept from
 * before the move so the route handlers did not have to change.
 *
 * `findOneAndUpdate` is atomic and accepts an optional `baselineSeq` /
 * `headSeq` comparison filter alongside `_id`. Compaction uses both: it must
 * only apply when `baselineSeq < N` (forward progress) AND `headSeq >= N`
 * (the seq has actually been issued). If the filter doesn't match, it
 * returns null and the caller backs off.
 *
 * `writeHash: { $exists: false }` is the legacy-record claim in
 * `lib/cloud/writeAuth.ts`: it only matches a record with no hash yet.
 */
export type CompactionFilter = {
  _id: string;
  baselineSeq?: { $lt: number };
  headSeq?: { $gte: number };
  writeHash?: { $exists: false };
};

export type AppCollection = {
  insertOne(doc: MatrixDoc): Promise<unknown>;
  findOne(filter: { _id: string }): Promise<MatrixDoc | null>;
  findOneAndUpdate(
    filter: CompactionFilter,
    update:
      | { $set: Partial<MatrixDoc> }
      | { $set: Partial<MatrixDoc>; $inc: Partial<Pick<MatrixDoc, "headSeq">> }
      | { $inc: Partial<Pick<MatrixDoc, "headSeq">>; $set: Partial<MatrixDoc> },
    options: { returnDocument: "after" },
  ): Promise<MatrixDoc | null>;
  /** Also deletes the record's updates. */
  deleteOne(filter: { _id: string }): Promise<unknown>;
};

/**
 * Storage surface for the matrix_updates log. Append-only
 * except for two prune paths: full-record deletion (matrix delete) and
 * compaction (drop updates already folded into a newer baseline).
 */
export type UpdatesCollection = {
  insertOne(doc: MatrixUpdate): Promise<unknown>;
  findSorted(filter: {
    recordId: string;
    minSeqExclusive?: number;
  }): Promise<MatrixUpdate[]>;
  deleteMany(filter: { recordId: string }): Promise<{ deletedCount?: number }>;
  /**
   * Drop every update for `recordId` with `seq <= maxSeqInclusive`. Used by
   * compaction once the matrix doc's `baselineSeq` has advanced past those
   * seqs — the read path already filters them out, this just reclaims space.
   */
  deleteUpToSeq(filter: {
    recordId: string;
    maxSeqInclusive: number;
  }): Promise<{ deletedCount?: number }>;
};

/** Today as `YYYY-MM-DD` (UTC). */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Today as a midnight-UTC `Date`. Used for `lastActivityDate` (the field
 * the idle cleanup reads), with the same calendar-day coarseness as
 * `todayUtc()`.
 */
export function todayUtcDate(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
