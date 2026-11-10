// @vitest-environment node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore, openDatabase } from "../lib/cloud/sqliteStore.mts";
import { dumpMatrices, makeTempDb, matrixDoc, seedMatrix, type TempDb } from "../lib/cloud/sqliteTestUtils";

/**
 * The script as the scheduled job runs it: plain `node`, straight from the
 * source tree. The deletion rules themselves are in lib/cloud/cleanup.test.ts.
 */

const SCRIPT = path.join(import.meta.dirname, "sqlite-cleanup.mts");

let temp: TempDb;

beforeEach(() => {
  temp = makeTempDb("riskmapper-cleanup-script-");
});

afterEach(() => {
  temp.remove();
});

function run(env: Record<string, string>) {
  return spawnSync(process.execPath, [SCRIPT], {
    env: { PATH: process.env.PATH, ...env },
    encoding: "utf8",
  });
}

describe("scripts/sqlite-cleanup.mts", () => {
  it("deletes idle records and reports counts, with no warnings", () => {
    const store = createStore(openDatabase(temp.file));
    seedMatrix(store.db, matrixDoc({ _id: "idle0000000000000000", lastActivityDate: new Date("2020-01-01") }));
    seedMatrix(store.db, matrixDoc({ _id: "keep0000000000000000", lastActivityDate: new Date() }));

    const res = run({ SQLITE_PATH: temp.file });

    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/^sqlite-cleanup: deleted 1 matrices idle since \d{4}-\d{2}-\d{2} or earlier, 0 of their updates, and 0 orphaned updates\n$/);
    expect(dumpMatrices(store.db).map((m) => m._id)).toEqual(["keep0000000000000000"]);
    store.close();
  });

  it("fails without creating anything when the database is not there", () => {
    const res = run({ SQLITE_PATH: temp.file });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/no SQLite database at/);
    expect(existsSync(temp.file)).toBe(false);
  });

  it("fails on a RETENTION_DAYS it can't trust", () => {
    createStore(openDatabase(temp.file)).close();
    const res = run({ SQLITE_PATH: temp.file, RETENTION_DAYS: "0" });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/RETENTION_DAYS/);
  });
});
