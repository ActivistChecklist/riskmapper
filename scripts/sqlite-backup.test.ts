// @vitest-environment node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore, openDatabase, type SqliteStore } from "../lib/cloud/sqliteStore.mts";
import { dumpMatrices, makeTempDb, matrixDoc, seedMatrix, seedUpdate, type TempDb } from "../lib/cloud/sqliteTestUtils";

const SCRIPT = path.join(import.meta.dirname, "sqlite-backup.mts");
const COPY = 'cp "$BACKUP_FILE" "$DEST/$BACKUP_NAME"';

let temp: TempDb;
let store: SqliteStore;
let dest: string;

beforeEach(() => {
  temp = makeTempDb("riskmapper-backup-");
  store = createStore(openDatabase(temp.file));
  dest = temp.dir;
});

afterEach(() => {
  store.close();
  temp.remove();
});

function run(env: Record<string, string>) {
  return spawnSync(process.execPath, [SCRIPT], {
    env: { PATH: process.env.PATH, SQLITE_PATH: temp.file, DEST: dest, ...env },
    encoding: "utf8",
  });
}

function uploaded(): string {
  const files = readdirSync(dest).filter((f) => f.startsWith("riskmapper-"));
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/^riskmapper-\d{4}-\d{2}-\d{2}\.sqlite$/);
  return path.join(dest, files[0]);
}

/** Nothing of the temporary snapshot directory is left beside the database. */
function noLeftovers(): void {
  expect(readdirSync(path.dirname(temp.file)).filter((f) => f.startsWith(".backup-"))).toEqual([]);
}

describe("scripts/sqlite-backup.mts", () => {
  it("hands a complete, private, self-contained snapshot to the upload command", () => {
    seedMatrix(store.db, matrixDoc({ _id: "aaaa0000000000000000", headSeq: 1 }));
    seedMatrix(store.db, matrixDoc({ _id: "bbbb0000000000000000" }));
    seedUpdate(store.db, { recordId: "aaaa0000000000000000", seq: 1, ciphertext: "v1.U", clientId: "c", createdAt: "2026-01-01" });

    const res = run({ SQLITE_BACKUP_UPLOAD_CMD: COPY });

    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/holds 2 matrices and 1 updates/);
    const file = uploaded();
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const snap = new DatabaseSync(file, { readOnly: true });
    expect(snap.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "delete" });
    expect(dumpMatrices(snap)).toEqual(dumpMatrices(store.db));
    snap.close();
    noLeftovers();
  });

  it("leaves out deleted matrices and anything not yet committed", async () => {
    const marker = "DELETED-MARKER-NOT-IN-BACKUPS";
    seedMatrix(store.db, matrixDoc({ _id: "gone0000000000000000", baseline: `v1.${marker}` }));
    await store.matrices.deleteOne({ _id: "gone0000000000000000" });
    seedMatrix(store.db, matrixDoc({ _id: "keep0000000000000000" }));
    // Another connection mid-transaction, as the server might be.
    const writer = new DatabaseSync(temp.file);
    writer.exec("BEGIN IMMEDIATE");
    writer.exec(`INSERT INTO matrices (id, lastActivityDate, doc) VALUES ('pend0000000000000000', '2026-01-01', '{}')`);

    const res = run({ SQLITE_BACKUP_UPLOAD_CMD: COPY });
    writer.exec("ROLLBACK");
    writer.close();

    expect(res.status).toBe(0);
    const file = uploaded();
    expect(readFileSync(file).includes(marker)).toBe(false);
    const snap = new DatabaseSync(file, { readOnly: true });
    expect(dumpMatrices(snap).map((m) => m._id)).toEqual(["keep0000000000000000"]);
    snap.close();
  });

  it("fails when the upload fails, without echoing the command, and cleans up", () => {
    const res = run({ SQLITE_BACKUP_UPLOAD_CMD: 'TOKEN=hunter2-secret; exit 7' });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/upload command failed \(exit 7\)/);
    expect(res.stdout + res.stderr).not.toContain("hunter2");
    noLeftovers();
  });

  it("fails before snapshotting when no upload command is set", () => {
    const res = run({});
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/SQLITE_BACKUP_UPLOAD_CMD is not set/);
    noLeftovers();
  });

  it("fails, and creates nothing, when the database is not there", () => {
    const missing = path.join(temp.dir, "nowhere", "db.sqlite");
    const res = run({ SQLITE_PATH: missing, SQLITE_BACKUP_UPLOAD_CMD: COPY });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/no SQLite database at/);
    expect(existsSync(path.dirname(missing))).toBe(false);
  });
});
