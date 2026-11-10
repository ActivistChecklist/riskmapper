/**
 * The driver-free half of the one-time MongoDB → SQLite copy: turn Mongo
 * documents into rows and replace the target's contents with them. Kept
 * apart from `copy.mts` so it can be tested without the `mongodb` package,
 * which the app no longer depends on. See README.md in this folder.
 *
 * Loaded directly by Node; see the import rule at the top of
 * `lib/cloud/sqliteStore.mts`.
 */
import type { DatabaseSync } from "node:sqlite";
import type { MatrixDoc, MatrixUpdate } from "../../lib/cloud/types.ts";
import { countRows, encodeMatrix, encodeUpdate, toDay } from "../../lib/cloud/sqliteStore.mts";

export type SourceDoc = Record<string, unknown>;

export type CopyReport = {
  matrices: {
    source: number;
    copied: number;
    /** Ids that are not strings. The API looks ids up as strings, so nobody could reach these. */
    skipped: number;
    /** Records with no usable `lastActivityDate`, given their latest recorded day instead. */
    activityDateDerived: number;
    inSqlite: number;
  };
  updates: {
    source: number;
    copied: number;
    /** Updates whose matrix no longer exists; the old orphan sweep would have deleted them. */
    orphaned: number;
    /** Rows without a string `recordId` and an integer `seq`. */
    skipped: number;
    inSqlite: number;
  };
  /** Characters of baseline plus update ciphertext, copied versus stored. */
  chars: { copied: number; inSqlite: number };
  ok: boolean;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A BSON-decoded value as plain JSON. Any `Date` becomes a calendar day,
 * never a timestamp. Anything else the app never writes (ObjectId, Binary,
 * Decimal128, ...) stops the copy, naming the field but not the value.
 */
function plain(value: unknown, where: string): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`non-finite number at ${where}`);
    return value;
  }
  if (value instanceof Date) return toDay(value);
  if (Array.isArray(value)) return value.map((v, i) => plain(v, `${where}[${i}]`));
  if (typeof value === "object") {
    const bsonType = (value as { _bsontype?: unknown })._bsontype;
    if (bsonType !== undefined) {
      throw new Error(`unsupported ${String(bsonType)} value at ${where}`);
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, plain(v, `${where}.${k}`)]),
    );
  }
  throw new Error(`unsupported ${typeof value} value at ${where}`);
}

/** The latest of the record's own calendar days, or today if it has none. */
function latestRecordedDay(fields: Record<string, unknown>): Date {
  const days = [fields.lastReadDate, fields.lastWriteDate, fields.createdDate]
    .filter((d): d is string => typeof d === "string" && DAY_RE.test(d))
    .sort();
  const day = days.at(-1) ?? new Date().toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00.000Z`);
}

export function matrixFromMongo(
  raw: SourceDoc,
): { doc: MatrixDoc; activityDateDerived: boolean } | null {
  const { _id, lastActivityDate, ...rest } = raw;
  if (typeof _id !== "string") return null;
  const fields = plain(rest, "matrices") as Record<string, unknown>;
  const usable = lastActivityDate instanceof Date && !Number.isNaN(lastActivityDate.getTime());
  return {
    doc: {
      ...(fields as Omit<MatrixDoc, "_id" | "lastActivityDate">),
      _id,
      lastActivityDate: usable ? lastActivityDate : latestRecordedDay(fields),
    },
    activityDateDerived: !usable,
  };
}

/** The row's old `_id` is dropped: a legacy ObjectId embeds the edit's time to the second. */
export function updateFromMongo(raw: SourceDoc): MatrixUpdate | null {
  const { recordId, seq, ...rest } = raw;
  delete rest._id;
  if (typeof recordId !== "string" || typeof seq !== "number" || !Number.isSafeInteger(seq)) {
    return null;
  }
  const fields = plain(rest, "matrix_updates") as Omit<MatrixUpdate, "recordId" | "seq">;
  return { ...fields, recordId, seq };
}

function storedChars(db: DatabaseSync): number {
  const { m } = db
    .prepare("SELECT coalesce(sum(length(json_extract(doc, '$.baseline'))), 0) AS m FROM matrices")
    .get() as { m: number };
  const { u } = db
    .prepare("SELECT coalesce(sum(length(json_extract(doc, '$.ciphertext'))), 0) AS u FROM matrix_updates")
    .get() as { u: number };
  return Number(m) + Number(u);
}

function chars(value: unknown): number {
  return typeof value === "string" ? value.length : 0;
}

/**
 * Make the target hold exactly what the source holds: delete every row, then
 * insert every source document, in one transaction. Running it again gives
 * the same result, and a failure part way leaves the target as it was.
 * Refuses a source with no matrices, which almost always means the wrong
 * database name rather than a genuinely empty one.
 */
export async function replaceWithSource(
  db: DatabaseSync,
  source: { matrices: AsyncIterable<SourceDoc>; updates: AsyncIterable<SourceDoc> },
): Promise<CopyReport> {
  const report: CopyReport = {
    matrices: { source: 0, copied: 0, skipped: 0, activityDateDerived: 0, inSqlite: 0 },
    updates: { source: 0, copied: 0, orphaned: 0, skipped: 0, inSqlite: 0 },
    chars: { copied: 0, inSqlite: 0 },
    ok: false,
  };
  const insertMatrix = db.prepare(
    "INSERT INTO matrices (id, lastActivityDate, doc) VALUES (?, ?, ?)",
  );
  const insertUpdate = db.prepare(
    "INSERT INTO matrix_updates (recordId, seq, doc) VALUES (?, ?, ?)",
  );
  const copiedIds = new Set<string>();

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM matrix_updates; DELETE FROM matrices;");

    for await (const raw of source.matrices) {
      report.matrices.source += 1;
      const m = matrixFromMongo(raw);
      if (!m) {
        report.matrices.skipped += 1;
        continue;
      }
      const row = encodeMatrix(m.doc);
      insertMatrix.run(row.id, row.lastActivityDate, row.doc);
      copiedIds.add(row.id);
      report.matrices.copied += 1;
      if (m.activityDateDerived) report.matrices.activityDateDerived += 1;
      report.chars.copied += chars(m.doc.baseline);
    }
    if (report.matrices.source === 0) {
      throw new Error("the source has no matrices; refusing to empty the target (check MONGO_DB)");
    }

    for await (const raw of source.updates) {
      report.updates.source += 1;
      const u = updateFromMongo(raw);
      if (!u) {
        report.updates.skipped += 1;
        continue;
      }
      if (!copiedIds.has(u.recordId)) {
        report.updates.orphaned += 1;
        continue;
      }
      const row = encodeUpdate(u);
      insertUpdate.run(row.recordId, row.seq, row.doc);
      report.updates.copied += 1;
      report.chars.copied += chars(u.ciphertext);
    }

    db.exec("COMMIT");
  } catch (err) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw err;
  }

  const counts = countRows(db);
  report.matrices.inSqlite = counts.matrices;
  report.updates.inSqlite = counts.updates;
  report.chars.inSqlite = storedChars(db);
  report.ok =
    counts.matrices === report.matrices.copied &&
    counts.updates === report.updates.copied &&
    report.chars.inSqlite === report.chars.copied;
  return report;
}

export function formatReport(r: CopyReport): string {
  const lines = [
    `  matrices        in Mongo ${r.matrices.source}, copied ${r.matrices.copied}, ` +
      `skipped ${r.matrices.skipped} (non-string id), in SQLite ${r.matrices.inSqlite}`,
    `  matrix_updates  in Mongo ${r.updates.source}, copied ${r.updates.copied}, ` +
      `orphaned ${r.updates.orphaned}, skipped ${r.updates.skipped} (malformed), in SQLite ${r.updates.inSqlite}`,
    `  ciphertext      copied ${r.chars.copied} chars, in SQLite ${r.chars.inSqlite} chars`,
  ];
  if (r.matrices.activityDateDerived > 0) {
    lines.push(
      `  note: ${r.matrices.activityDateDerived} matrices had no lastActivityDate; used their latest recorded day`,
    );
  }
  lines.push(
    r.ok
      ? "  OK: SQLite holds exactly what was copied"
      : "  MISMATCH: SQLite does not hold what was copied",
  );
  return lines.join("\n");
}
