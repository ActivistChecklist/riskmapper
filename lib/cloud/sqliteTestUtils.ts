import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  decodeMatrix,
  decodeUpdate,
  encodeMatrix,
  encodeUpdate,
  type MatrixRow,
  type UpdateRow,
} from "./sqliteStore.mts";
import type { MatrixDoc, MatrixUpdate } from "./types";

/**
 * Test helpers for the SQLite store. Each test gets its own temporary
 * database file, so nothing leaks between tests and nothing depends on a
 * shared server.
 */

export type TempDb = { dir: string; file: string; remove(): void };

export function makeTempDb(prefix = "riskmapper-test-"): TempDb {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  return {
    dir,
    file: path.join(dir, "db", "riskmapper.sqlite"),
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export function dumpMatrices(db: DatabaseSync): MatrixDoc[] {
  const rows = db
    .prepare("SELECT id, lastActivityDate, doc FROM matrices ORDER BY id")
    .all() as MatrixRow[];
  return rows.map(decodeMatrix);
}

export function dumpUpdates(db: DatabaseSync): MatrixUpdate[] {
  const rows = db
    .prepare("SELECT recordId, seq, doc FROM matrix_updates ORDER BY recordId, seq")
    .all() as UpdateRow[];
  return rows.map(decodeUpdate);
}

/** Insert or overwrite, bypassing the collections' duplicate checks. */
export function seedMatrix(db: DatabaseSync, doc: MatrixDoc): void {
  const row = encodeMatrix(doc);
  db.prepare(
    "INSERT OR REPLACE INTO matrices (id, lastActivityDate, doc) VALUES (?, ?, ?)",
  ).run(row.id, row.lastActivityDate, row.doc);
}

/** Insert or overwrite. The matrix must exist: updates have a foreign key. */
export function seedUpdate(db: DatabaseSync, update: MatrixUpdate): void {
  const row = encodeUpdate(update);
  db.prepare(
    "INSERT OR REPLACE INTO matrix_updates (recordId, seq, doc) VALUES (?, ?, ?)",
  ).run(row.recordId, row.seq, row.doc);
}

/** A matrix with sensible defaults, for tests that only care about a field or two. */
export function matrixDoc(overrides: Partial<MatrixDoc> & { _id: string }): MatrixDoc {
  return {
    baseline: "v1.BASELINE",
    baselineSeq: 0,
    headSeq: 0,
    createdDate: "2026-01-01",
    lastWriteDate: "2026-01-01",
    lastReadDate: null,
    lastActivityDate: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}
