// @vitest-environment node
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupDatabase,
  DEFAULT_RETENTION_DAYS,
  idleCutoffDay,
  retentionDaysFromEnv,
} from "./cleanup.mts";
import { createStore, openDatabase, type SqliteStore } from "./sqliteStore.mts";
import {
  dumpMatrices,
  dumpUpdates,
  makeTempDb,
  matrixDoc,
  seedMatrix,
  seedUpdate,
  type TempDb,
} from "./sqliteTestUtils";

let temp: TempDb;
let store: SqliteStore;

beforeEach(() => {
  temp = makeTempDb("riskmapper-cleanup-");
  store = createStore(openDatabase(temp.file));
});

afterEach(() => {
  store.close();
  temp.remove();
});

const NOW = new Date("2026-11-10T03:00:00Z");

function seedActiveOn(id: string, day: string, updates = 0): void {
  seedMatrix(
    store.db,
    matrixDoc({ _id: id, headSeq: updates, lastActivityDate: new Date(`${day}T00:00:00Z`) }),
  );
  for (let seq = 1; seq <= updates; seq++) {
    seedUpdate(store.db, {
      recordId: id,
      seq,
      ciphertext: `v1.${id}.${seq}`,
      clientId: "c",
      createdAt: day,
    });
  }
}

describe("retentionDaysFromEnv", () => {
  it("defaults to 90 days", () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(90);
    expect(retentionDaysFromEnv({})).toBe(90);
    expect(retentionDaysFromEnv({ RETENTION_DAYS: "" })).toBe(90);
    expect(retentionDaysFromEnv({ RETENTION_DAYS: "30" })).toBe(30);
  });

  it.each(["0", "-1", "1.5", "ninety", "NaN"])(
    "refuses %j rather than deleting everything",
    (value) => {
      expect(() => retentionDaysFromEnv({ RETENTION_DAYS: value })).toThrow(/RETENTION_DAYS/);
    },
  );
});

describe("idleCutoffDay", () => {
  it("is the day the retention period ago, whatever the time now", () => {
    expect(idleCutoffDay(NOW, 90)).toBe("2026-08-12");
    expect(idleCutoffDay(new Date("2026-11-10T23:59:59Z"), 90)).toBe("2026-08-12");
    expect(idleCutoffDay(new Date("2026-03-01T00:00:00Z"), 1)).toBe("2026-02-28");
  });
});

describe("cleanupDatabase", () => {
  it("deletes matrices idle for the retention period and their updates, and nothing else", () => {
    // Last active 2026-08-12: 90 days before 2026-11-10, so it goes, as it
    // would have under the TTL index. One day later stays.
    seedActiveOn("idle0000000000000000", "2026-08-12", 2);
    seedActiveOn("older000000000000000", "2025-01-01", 1);
    seedActiveOn("keep0000000000000000", "2026-08-13", 3);

    const result = cleanupDatabase(store.db, { retentionDays: 90, now: NOW });

    expect(result).toEqual({
      cutoffDay: "2026-08-12",
      matrices: 2,
      updates: 3,
      orphanUpdates: 0,
      walTruncated: true,
    });
    expect(dumpMatrices(store.db).map((m) => m._id)).toEqual(["keep0000000000000000"]);
    expect(dumpUpdates(store.db).map((u) => u.recordId)).toEqual(
      Array(3).fill("keep0000000000000000"),
    );
  });

  it("sweeps updates left without a matrix", () => {
    seedActiveOn("keep0000000000000000", "2026-11-01", 1);
    // Written by a connection with foreign keys off, as the sqlite3 shell
    // has by default. The app's own connection can't create these.
    const raw = new DatabaseSync(temp.file, { enableForeignKeyConstraints: false });
    raw
      .prepare("INSERT INTO matrix_updates (recordId, seq, doc) VALUES (?, ?, ?)")
      .run("gone0000000000000000", 1, "{}");
    raw.close();

    const result = cleanupDatabase(store.db, { retentionDays: 90, now: NOW });

    expect(result.orphanUpdates).toBe(1);
    expect(dumpUpdates(store.db).map((u) => u.recordId)).toEqual(["keep0000000000000000"]);
  });

  it("leaves no trace of a deleted matrix in the database file or its WAL", () => {
    const marker = "SECRET-MARKER-THAT-MUST-NOT-SURVIVE";
    seedMatrix(
      store.db,
      matrixDoc({
        _id: "idle0000000000000000",
        baseline: `v1.${marker}`,
        lastActivityDate: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    seedActiveOn("keep0000000000000000", "2026-11-01", 1);
    const contains = () =>
      [temp.file, `${temp.file}-wal`].some((f) => {
        try {
          return readFileSync(f).includes(marker);
        } catch {
          return false;
        }
      });
    expect(contains()).toBe(true);

    cleanupDatabase(store.db, { retentionDays: 90, now: NOW });

    expect(contains()).toBe(false);
  });
});
