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
};

export type MatrixUpdate = {
  recordId: string;
  seq: number;
  ciphertext: string;
  clientId: string;
  createdAt: string;
};

/**
 * Narrow Mongo surface for the matrices collection.
 */
export type AppCollection = {
  insertOne(doc: MatrixDoc): Promise<unknown>;
  findOne(filter: { _id: string }): Promise<MatrixDoc | null>;
  findOneAndUpdate(
    filter: { _id: string },
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
 * Narrow Mongo surface for the matrix_updates collection. Append-only;
 * read by `(recordId, seq)`.
 */
export type UpdatesCollection = {
  insertOne(doc: MatrixUpdate): Promise<unknown>;
  findSorted(filter: {
    recordId: string;
    minSeqExclusive?: number;
  }): Promise<MatrixUpdate[]>;
  deleteMany(filter: { recordId: string }): Promise<{ deletedCount?: number }>;
};

/** Today as `YYYY-MM-DD` (UTC). */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
