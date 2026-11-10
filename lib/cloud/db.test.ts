import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDbForTests, __storeForTests, getCollection, getUpdatesCollection } from "./db";
import { makeTempDb, matrixDoc, type TempDb } from "./sqliteTestUtils";
import { DEFAULT_SQLITE_PATH, sqlitePathFromEnv } from "./sqliteStore.mts";

/**
 * The server's connection: where it opens, what it opens with, and that a
 * failed open is retried rather than cached. A cached failure would leave a
 * long-lived server returning 500 until someone restarted it by hand, which
 * is what happened under MongoDB before the connect promise was evicted on
 * failure.
 */

let temp: TempDb;

beforeEach(() => {
  temp = makeTempDb("riskmapper-db-");
  vi.stubEnv("SQLITE_PATH", temp.file);
  __resetDbForTests();
});

afterEach(() => {
  __resetDbForTests();
  temp.remove();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const mode = (file: string) => statSync(file).mode & 0o777;

describe("getCollection", () => {
  it("opens on first use and reuses one connection", async () => {
    const a = await getCollection();
    const b = await getCollection();
    const u = await getUpdatesCollection();
    expect(a).toBe(b);
    expect(__storeForTests().updates).toBe(u);
  });

  it("retries after a failed open instead of caching the failure", async () => {
    // A file where the database's directory should be: the open fails the
    // way a storage directory that is not mounted yet would.
    writeFileSync(path.dirname(temp.file), "");
    await expect(getCollection()).rejects.toThrow();
    await expect(getUpdatesCollection()).rejects.toThrow();

    rmSync(path.dirname(temp.file));
    const coll = await getCollection();
    await coll.insertOne(matrixDoc({ _id: "abcd1234efgh5678ijkl" }));
    expect(await coll.findOne({ _id: "abcd1234efgh5678ijkl" })).not.toBeNull();
  });

  it("keeps data across reopening", async () => {
    await (await getCollection()).insertOne(matrixDoc({ _id: "abcd1234efgh5678ijkl" }));
    __resetDbForTests();
    expect(await (await getCollection()).findOne({ _id: "abcd1234efgh5678ijkl" })).not.toBeNull();
  });

  it("refuses a database written by a newer schema, and retries next time", async () => {
    mkdirSync(path.dirname(temp.file), { recursive: true });
    const newer = new DatabaseSync(temp.file);
    newer.exec("PRAGMA user_version = 99");
    newer.close();

    await expect(getCollection()).rejects.toThrow(/schema version 99 is newer/);
    await expect(getCollection()).rejects.toThrow(/schema version 99 is newer/);
  });
});

describe("the database file", () => {
  it("creates its directory 0700 and the file 0600, WAL included", async () => {
    await (await getCollection()).insertOne(matrixDoc({ _id: "abcd1234efgh5678ijkl" }));
    expect(mode(path.dirname(temp.file))).toBe(0o700);
    expect(mode(temp.file)).toBe(0o600);
    expect(mode(`${temp.file}-wal`)).toBe(0o600);
    expect(mode(`${temp.file}-shm`)).toBe(0o600);
  });

  it("tightens a file that arrives readable by others", async () => {
    await getCollection();
    __resetDbForTests();
    chmodSync(temp.file, 0o644);

    await getCollection();
    expect(mode(temp.file)).toBe(0o600);
  });

  it("opens with WAL, full sync, foreign keys, secure delete and a busy timeout", async () => {
    await getCollection();
    const db = __storeForTests().db;
    const pragma = (name: string) => Object.values(db.prepare(`PRAGMA ${name}`).get()!)[0];
    expect(pragma("journal_mode")).toBe("wal");
    expect(pragma("synchronous")).toBe(2); // FULL
    expect(pragma("foreign_keys")).toBe(1);
    expect(pragma("secure_delete")).toBe(1);
    expect(pragma("busy_timeout")).toBe(5000);
  });
});

describe("SQLITE_PATH", () => {
  it("defaults to a path under .data/ in the working directory", () => {
    expect(sqlitePathFromEnv({})).toBe(path.resolve(DEFAULT_SQLITE_PATH));
    expect(sqlitePathFromEnv({ SQLITE_PATH: "" })).toBe(path.resolve(DEFAULT_SQLITE_PATH));
    expect(sqlitePathFromEnv({ SQLITE_PATH: "/srv/x.sqlite" })).toBe("/srv/x.sqlite");
  });

  it("keeps the default database out of git", () => {
    // Exits non-zero, and so throws, if the path is not ignored.
    execFileSync("git", ["check-ignore", "-q", DEFAULT_SQLITE_PATH]);
  });
});
