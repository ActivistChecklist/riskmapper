import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Connection-cache recovery.
 *
 * The failure this guards against is nasty in production: if a failed
 * `connect()` is cached, every later request re-awaits the same rejected
 * promise, so a single transient Mongo outage takes the API down until
 * someone restarts the process by hand. It surfaced for real when the dev
 * Mongo container was stopped: the API kept returning 500 after the database
 * came back healthy, while a freshly started process served the same request
 * fine.
 */

const state = vi.hoisted(() => ({
  connectResults: [] as (Error | null)[],
  constructed: 0,
  closed: 0,
}));

vi.mock("mongodb", () => ({
  MongoClient: class {
    constructor() {
      state.constructed += 1;
    }
    connect() {
      const next = state.connectResults.shift() ?? null;
      return next ? Promise.reject(next) : Promise.resolve(this);
    }
    close() {
      state.closed += 1;
      return Promise.resolve();
    }
    db() {
      return {
        collection: () => ({
          createIndex: () => Promise.resolve(),
        }),
      };
    }
  },
}));

vi.mock("./config", () => ({
  MONGO_URL: "mongodb://127.0.0.1:27017",
  MONGO_DB: "test",
  MONGO_COLLECTION: "matrices",
  MONGO_UPDATES_COLLECTION: "matrix_updates",
}));

async function loadDb() {
  const mod = await import("./db");
  mod.__resetDbForTests();
  return mod;
}

beforeEach(() => {
  vi.resetModules();
  state.connectResults = [];
  state.constructed = 0;
  state.closed = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getCollection connection caching", () => {
  it("reuses one connection across calls when Mongo is reachable", async () => {
    const { getCollection } = await loadDb();

    await getCollection();
    await getCollection();
    await getCollection();

    expect(state.constructed).toBe(1);
  });

  it("retries after a failed connection instead of replaying the rejection", async () => {
    state.connectResults = [new Error("connect ECONNREFUSED 127.0.0.1:27017")];
    const { getCollection } = await loadDb();

    await expect(getCollection()).rejects.toThrow(/ECONNREFUSED/);

    // Mongo is back. The next call must build a new client rather than
    // re-await the cached rejection.
    await expect(getCollection()).resolves.toBeDefined();
    expect(state.constructed).toBe(2);
  });

  it("recovers even after several consecutive failures", async () => {
    state.connectResults = [
      new Error("down 1"),
      new Error("down 2"),
      new Error("down 3"),
    ];
    const { getCollection } = await loadDb();

    for (const message of ["down 1", "down 2", "down 3"]) {
      await expect(getCollection()).rejects.toThrow(message);
    }
    await expect(getCollection()).resolves.toBeDefined();
    expect(state.constructed).toBe(4);
  });

  it("closes the client of a failed attempt so the socket is not leaked", async () => {
    state.connectResults = [new Error("nope")];
    const { getCollection } = await loadDb();

    await expect(getCollection()).rejects.toThrow("nope");
    // The catch handler calls close() on the abandoned client.
    await vi.waitFor(() => expect(state.closed).toBe(1));
  });

  it("applies the same recovery to the updates collection", async () => {
    state.connectResults = [new Error("connect ECONNREFUSED")];
    const { getUpdatesCollection } = await loadDb();

    await expect(getUpdatesCollection()).rejects.toThrow(/ECONNREFUSED/);
    await expect(getUpdatesCollection()).resolves.toBeDefined();
    expect(state.constructed).toBe(2);
  });

  it("shares one recovered connection between both accessors", async () => {
    state.connectResults = [new Error("down")];
    const { getCollection, getUpdatesCollection } = await loadDb();

    await expect(getCollection()).rejects.toThrow("down");
    await getCollection();
    await getUpdatesCollection();

    expect(state.constructed).toBe(2);
  });
});
