/**
 * Shape of a stored encrypted matrix record. The server treats `ciphertext`
 * as opaque — it never decrypts. See `THREAT-MODEL.md`.
 */
export type MatrixDoc = {
  _id: string;
  ciphertext: string;
  lamport: number;
  version: number;
  createdDate: string;
  lastWriteDate: string;
  lastReadDate: string | null;
};

/**
 * Narrow interface over the MongoDB collection methods the cloud handlers
 * use. Lets tests inject an in-memory fake without booting Mongo.
 */
export type AppCollection = {
  insertOne(doc: MatrixDoc): Promise<unknown>;
  findOne(filter: { _id: string }): Promise<MatrixDoc | null>;
  findOneAndUpdate(
    filter: { _id: string; version?: number },
    update:
      | { $set: Partial<MatrixDoc> }
      | { $set: Partial<MatrixDoc>; $inc: { version: number } },
    options: { returnDocument: "after" },
  ): Promise<MatrixDoc | null>;
  deleteOne(filter: { _id: string }): Promise<unknown>;
};

/** Today as `YYYY-MM-DD` (UTC). */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
