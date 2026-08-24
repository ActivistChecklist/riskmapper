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
   * Midnight-UTC `Date` of the most recent read or write. Indexed with
   * MongoDB's TTL feature in `db.ts` so records become eligible for
   * automatic deletion 90 days after their last activity. Stored as a
   * BSON `Date` (TTL needs a real Date type) but always rounded to the
   * day so the underlying datetime carries no time-of-day metadata —
   * matches the "coarse calendar dates" promise in THREAT-MODEL.md.
   */
  lastActivityDate: Date;
};

export type MatrixUpdate = {
  /**
   * Set explicitly on every write, and never left to the driver.
   *
   * An auto-generated ObjectId carries its own creation time in its first
   * four bytes, at one-second resolution. Leaving `_id` off would therefore
   * have stamped a precise wall-clock timestamp on every single edit, which
   * is exactly the metadata `createdAt` is rounded to a calendar day to
   * avoid, and exactly what a database dump or a subpoena would surface.
   * `recordId:seq` carries no time and is unique by construction, because
   * `seq` is assigned by an atomic `$inc` on the matrix doc.
   *
   * Optional in the type only so the read path keeps working for rows
   * written before this existed, which still have real ObjectIds. Nothing
   * reads this field.
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
 * Narrow Mongo surface for the matrices collection.
 *
 * `findOneAndUpdate` accepts an optional `baselineSeq` / `headSeq`
 * comparison filter alongside `_id`. Compaction uses both: it must only
 * apply when `baselineSeq < N` (forward progress) AND `headSeq >= N`
 * (the seq has actually been issued). If the filter doesn't match,
 * Mongo returns null and the caller backs off.
 */
export type CompactionFilter = {
  _id: string;
  baselineSeq?: { $lt: number };
  headSeq?: { $gte: number };
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
  deleteOne(filter: { _id: string }): Promise<unknown>;
  deleteMany(filter: Record<string, unknown>): Promise<{ deletedCount?: number }>;
};

/**
 * Narrow Mongo surface for the matrix_updates collection. Append-only
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
 * Today as a midnight-UTC `Date`. Used for `lastActivityDate` (the TTL
 * field) so the BSON value is a real Date but carries no time-of-day
 * granularity — same calendar-day coarseness as `todayUtc()`.
 */
export function todayUtcDate(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
