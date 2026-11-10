/**
 * SQLite storage for the cloud-sync relay, on Node's built-in `node:sqlite`.
 *
 * This file is loaded two ways: bundled into the server by Vite (through
 * `db.ts`), and run directly by Node from the maintenance scripts in
 * `scripts/`, which rely on Node's type stripping instead of a build step.
 * The second way is why it is `.mts` and may import only `node:` builtins
 * and whole-statement `import type` declarations. Node loads nothing else
 * without a bundler, and an inline `import { type X }` still loads the file.
 *
 * Layout. Each matrix is one JSON document, so adding a field never needs a
 * schema migration. A value is a real column only when a query filters on
 * it: the record id, `lastActivityDate` (the idle cleanup), and `(recordId,
 * seq)` for updates, which is also the uniqueness guarantee on seqs.
 *
 * Privacy choices that are easy to undo by accident:
 *
 * - Both tables are `WITHOUT ROWID`. An ordinary table keeps a hidden,
 *   incrementing rowid, which would record the global order in which
 *   matrices were created and edits arrived, across every record. That
 *   ordering is exactly the kind of metadata the calendar-day dates exist
 *   to avoid.
 * - `lastActivityDate` is stored as a `YYYY-MM-DD` day, and a CHECK
 *   constraint refuses anything finer, so a time of day cannot land on disk
 *   even if a caller passes a full `Date`.
 * - Update rows store no `_id`. `(recordId, seq)` already identifies them
 *   and carries no time; see `MatrixUpdate._id`.
 * - `secure_delete` zeroes deleted rows instead of leaving them in free
 *   pages. Older copies of those pages can still sit in the WAL, so
 *   deleting a matrix truncates the WAL straight away (`truncateWal`), and
 *   the daily cleanup does it again in case that was skipped.
 * - The database file is 0600 and a directory we create for it is 0700.
 *   SQLite gives the `-wal` and `-shm` files the database file's mode.
 */
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type {
  AppCollection,
  CompactionFilter,
  MatrixDoc,
  MatrixUpdate,
  UpdatesCollection,
} from "./types.ts";

/** Used when `SQLITE_PATH` is unset. Relative to the working directory, and gitignored. */
export const DEFAULT_SQLITE_PATH = ".data/riskmapper.sqlite";

/**
 * How long a statement waits for another connection's lock before failing.
 * The server holds the only long-lived connection; the cleanup and backup
 * jobs open their own and hold locks for milliseconds, or for a backup, take
 * only a read snapshot, which in WAL mode never blocks a writer.
 */
export const BUSY_TIMEOUT_MS = 5_000;

/** Bump with a migration in `migrate()`. A newer file refuses to open in an older build. */
export const SCHEMA_VERSION = 1;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function sqlitePathFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.SQLITE_PATH || DEFAULT_SQLITE_PATH);
}

/**
 * Open (and by default create) the database at `file`, apply the connection
 * settings, and bring the schema up to date.
 *
 * `create: false` is for the maintenance scripts: a cron job pointed at the
 * wrong path should fail, not cheerfully clean up a brand-new empty file.
 */
export function openDatabase(
  file: string,
  opts: { create?: boolean } = {},
): DatabaseSync {
  const create = opts.create ?? true;
  if (!existsSync(file)) {
    if (!create) throw new Error(`no SQLite database at ${file}`);
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    try {
      // Created empty with 0600 before SQLite sees it, so the file is never
      // world-readable, not even for the instant between create and chmod.
      closeSync(openSync(file, "wx", 0o600));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
  // Also tightens a file that arrived with a looser mode, say copied onto
  // the server by hand.
  for (const f of [file, `${file}-wal`, `${file}-shm`]) {
    if (existsSync(f)) chmodSync(f, 0o600);
  }

  const db = new DatabaseSync(file, {
    timeout: BUSY_TIMEOUT_MS,
    enableForeignKeyConstraints: true,
  });
  try {
    const { journal_mode } = db.prepare("PRAGMA journal_mode = WAL").get() as {
      journal_mode: string;
    };
    if (journal_mode !== "wal") {
      // Still correct, but the backup and cleanup jobs will block the
      // server while they run. Happens on filesystems without shared memory.
      console.warn(`[sqlite] WAL unavailable, using journal_mode=${journal_mode}`);
    }
    // FULL, not the NORMAL often recommended with WAL: a seq the server has
    // acknowledged must survive a power cut, or a client that saw it would
    // diverge from the log after a restart. Writes are small and rare.
    db.exec("PRAGMA synchronous = FULL");
    db.exec("PRAGMA secure_delete = ON");
    migrate(db);
  } catch (err) {
    db.close();
    throw err;
  }
  return db;
}

function migrate(db: DatabaseSync): void {
  const { user_version } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  if (user_version > SCHEMA_VERSION) {
    throw new Error(
      `database schema version ${user_version} is newer than this build supports (${SCHEMA_VERSION})`,
    );
  }
  if (user_version === SCHEMA_VERSION) return;
  inTransaction(db, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS matrices (
        id TEXT PRIMARY KEY NOT NULL,
        lastActivityDate TEXT NOT NULL
          CHECK (lastActivityDate GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        doc TEXT NOT NULL CHECK (json_valid(doc))
      ) STRICT, WITHOUT ROWID;

      CREATE INDEX IF NOT EXISTS matrices_by_last_activity
        ON matrices (lastActivityDate);

      CREATE TABLE IF NOT EXISTS matrix_updates (
        recordId TEXT NOT NULL REFERENCES matrices (id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        doc TEXT NOT NULL CHECK (json_valid(doc)),
        PRIMARY KEY (recordId, seq)
      ) STRICT, WITHOUT ROWID;

      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  });
}

/**
 * Run `fn` inside `BEGIN IMMEDIATE`, which takes the write lock up front.
 * Because `node:sqlite` is synchronous, nothing else in this process can run
 * between the statements in `fn`; the lock is what keeps other processes
 * (the cleanup and backup jobs) out as well.
 */
export function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Thrown when an insert collides with an existing key. Recognized by `code`
 * rather than `instanceof` so it survives a second copy of this module, as
 * happens under test module resets.
 */
export class DuplicateKeyError extends Error {
  readonly code = "DUPLICATE_KEY";
  constructor(message: string) {
    super(message);
    this.name = "DuplicateKeyError";
  }
}

export function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "DUPLICATE_KEY"
  );
}

// SQLITE_CONSTRAINT_PRIMARYKEY and SQLITE_CONSTRAINT_UNIQUE.
const DUPLICATE_ERRCODES = new Set([1555, 2067]);

function translateInsertError(err: unknown): unknown {
  const errcode = (err as { errcode?: unknown } | null)?.errcode;
  if (typeof errcode === "number" && DUPLICATE_ERRCODES.has(errcode)) {
    return new DuplicateKeyError((err as Error).message);
  }
  return err;
}

/**
 * Checkpoint the WAL into the database file and truncate it, so earlier
 * copies of pages that held deleted rows are gone from disk too. Never
 * waits: if another connection is mid-read (a backup, say), it gives up
 * rather than stall the server, and the daily cleanup's checkpoint, which
 * may wait, finishes the job. Returns whether the WAL was truncated.
 */
export function truncateWal(db: DatabaseSync, opts: { wait?: boolean } = {}): boolean {
  if (!opts.wait) db.exec("PRAGMA busy_timeout = 0");
  try {
    const { busy } = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get() as { busy: number };
    return busy === 0;
  } finally {
    if (!opts.wait) db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  }
}

// ─── Row encoding ────────────────────────────────────────────────────

export type MatrixRow = { id: string; lastActivityDate: string; doc: string };
export type UpdateRow = { recordId: string; seq: number; doc: string };

/** A `Date` as its UTC calendar day. The time of day is dropped, never stored. */
export function toDay(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError("lastActivityDate must be a valid Date");
  }
  return value.toISOString().slice(0, 10);
}

function fromDay(day: string): Date {
  if (!DAY_RE.test(day)) throw new TypeError(`not a calendar day: ${day}`);
  return new Date(`${day}T00:00:00.000Z`);
}

export function encodeMatrix(doc: MatrixDoc): MatrixRow {
  const { _id, lastActivityDate, ...rest } = doc;
  return {
    id: _id,
    lastActivityDate: toDay(lastActivityDate),
    doc: JSON.stringify(rest),
  };
}

export function decodeMatrix(row: MatrixRow): MatrixDoc {
  const rest = JSON.parse(row.doc) as Omit<MatrixDoc, "_id" | "lastActivityDate">;
  return { ...rest, _id: row.id, lastActivityDate: fromDay(row.lastActivityDate) };
}

export function encodeUpdate(update: MatrixUpdate): UpdateRow {
  const { recordId, seq, ...rest } = update;
  delete rest._id;
  if (!Number.isSafeInteger(seq)) throw new TypeError("seq must be an integer");
  return { recordId, seq, doc: JSON.stringify(rest) };
}

export function decodeUpdate(row: UpdateRow): MatrixUpdate {
  const rest = JSON.parse(row.doc) as Omit<MatrixUpdate, "recordId" | "seq">;
  return { ...rest, recordId: row.recordId, seq: row.seq };
}

// ─── Collections ─────────────────────────────────────────────────────

/** The `$lt` / `$gte` / `$exists: false` conditions `findOneAndUpdate` accepts. */
export function matchesFilter(doc: MatrixDoc, filter: CompactionFilter): boolean {
  if (filter.baselineSeq !== undefined && !(doc.baselineSeq < filter.baselineSeq.$lt)) {
    return false;
  }
  if (filter.headSeq !== undefined && !(doc.headSeq >= filter.headSeq.$gte)) {
    return false;
  }
  if (filter.writeHash !== undefined && doc.writeHash !== undefined) return false;
  return true;
}

type MatrixUpdateSpec = Parameters<AppCollection["findOneAndUpdate"]>[1];

function applyUpdate(doc: MatrixDoc, update: MatrixUpdateSpec): MatrixDoc {
  const next: MatrixDoc = { ...doc };
  if (update.$set) {
    if (update.$set._id !== undefined && update.$set._id !== doc._id) {
      throw new Error("_id is immutable");
    }
    Object.assign(next, update.$set);
  }
  if ("$inc" in update && typeof update.$inc?.headSeq === "number") {
    next.headSeq = doc.headSeq + update.$inc.headSeq;
  }
  return next;
}

export type SqliteStore = {
  db: DatabaseSync;
  matrices: AppCollection;
  updates: UpdatesCollection;
  close(): void;
};

/**
 * The `AppCollection` / `UpdatesCollection` surfaces the route handlers use,
 * over one connection. Statements are prepared once.
 */
export function createStore(db: DatabaseSync): SqliteStore {
  const q = {
    getMatrix: db.prepare("SELECT id, lastActivityDate, doc FROM matrices WHERE id = ?"),
    insertMatrix: db.prepare(
      "INSERT INTO matrices (id, lastActivityDate, doc) VALUES (?, ?, ?)",
    ),
    replaceMatrix: db.prepare(
      "UPDATE matrices SET lastActivityDate = ?, doc = ? WHERE id = ?",
    ),
    deleteMatrix: db.prepare("DELETE FROM matrices WHERE id = ?"),
    insertUpdate: db.prepare(
      "INSERT INTO matrix_updates (recordId, seq, doc) VALUES (?, ?, ?)",
    ),
    updatesAfter: db.prepare(
      "SELECT recordId, seq, doc FROM matrix_updates WHERE recordId = ? AND seq > ? ORDER BY seq",
    ),
    deleteUpdates: db.prepare("DELETE FROM matrix_updates WHERE recordId = ?"),
    deleteUpdatesUpTo: db.prepare(
      "DELETE FROM matrix_updates WHERE recordId = ? AND seq <= ?",
    ),
  } satisfies Record<string, StatementSync>;

  const getMatrix = (id: string): MatrixRow | undefined =>
    q.getMatrix.get(id) as MatrixRow | undefined;

  const matrices: AppCollection = {
    async insertOne(doc) {
      const row = encodeMatrix(doc);
      try {
        q.insertMatrix.run(row.id, row.lastActivityDate, row.doc);
      } catch (err) {
        throw translateInsertError(err);
      }
      return { acknowledged: true, insertedId: doc._id };
    },

    async findOne(filter) {
      const row = getMatrix(filter._id);
      return row ? decodeMatrix(row) : null;
    },

    // Read, check, and write in one transaction: the conditional filters
    // (compaction's forward-progress check, the legacy write-hash claim) and
    // the `$inc` that assigns each update its seq all depend on no other
    // writer getting in between.
    async findOneAndUpdate(filter, update) {
      return inTransaction(db, () => {
        const row = getMatrix(filter._id);
        if (!row) return null;
        const current = decodeMatrix(row);
        if (!matchesFilter(current, filter)) return null;
        const next = encodeMatrix(applyUpdate(current, update));
        q.replaceMatrix.run(next.lastActivityDate, next.doc, next.id);
        // Decode what was stored, so the caller sees exactly what a later
        // read would, day-rounded date included.
        return decodeMatrix(next);
      });
    },

    // The record's updates go with it (ON DELETE CASCADE). "Stop sharing"
    // promises the server copy is gone, so the WAL goes too.
    async deleteOne(filter) {
      const deletedCount = Number(q.deleteMatrix.run(filter._id).changes);
      if (deletedCount > 0) truncateWal(db);
      return { acknowledged: true, deletedCount };
    },
  };

  const updates: UpdatesCollection = {
    async insertOne(update) {
      const row = encodeUpdate(update);
      try {
        q.insertUpdate.run(row.recordId, row.seq, row.doc);
      } catch (err) {
        throw translateInsertError(err);
      }
      return { acknowledged: true };
    },

    async findSorted(filter) {
      const rows = q.updatesAfter.all(
        filter.recordId,
        filter.minSeqExclusive ?? Number.MIN_SAFE_INTEGER,
      ) as UpdateRow[];
      return rows.map(decodeUpdate);
    },

    async deleteMany(filter) {
      const res = q.deleteUpdates.run(filter.recordId);
      return { deletedCount: Number(res.changes) };
    },

    async deleteUpToSeq(filter) {
      const res = q.deleteUpdatesUpTo.run(filter.recordId, filter.maxSeqInclusive);
      return { deletedCount: Number(res.changes) };
    },
  };

  return { db, matrices, updates, close: () => db.close() };
}

/** Row counts, for the maintenance scripts' reports. Counts only, never ids. */
export function countRows(db: DatabaseSync): { matrices: number; updates: number } {
  const count = (table: string) =>
    Number((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n);
  return { matrices: count("matrices"), updates: count("matrix_updates") };
}
