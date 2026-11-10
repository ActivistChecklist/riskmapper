import {
  createStore,
  DEFAULT_SQLITE_PATH,
  openDatabase,
  sqlitePathFromEnv,
  type SqliteStore,
} from "./sqliteStore.mts";
import type { AppCollection, UpdatesCollection } from "./types";

/**
 * The server's one SQLite connection, opened on first use at `SQLITE_PATH`.
 *
 * One connection is enough because the server is one process by design (the
 * pub/sub fan-out and the rate limiter are in memory too). A failed open is
 * not cached: the next request tries again, so a storage directory that
 * appears late, or a permissions fix, does not need a restart.
 */

let store: SqliteStore | null = null;

function getStore(): SqliteStore {
  if (!store) {
    const file = sqlitePathFromEnv();
    store = createStore(openDatabase(file));
    if (!process.env.SQLITE_PATH) {
      console.warn(
        `[risk-matrix-api] SQLITE_PATH is not set; using ${file} (default ${DEFAULT_SQLITE_PATH})`,
      );
    }
  }
  return store;
}

export async function getCollection(): Promise<AppCollection> {
  return getStore().matrices;
}

export async function getUpdatesCollection(): Promise<UpdatesCollection> {
  return getStore().updates;
}

/** Closes and forgets the connection, so the next call reopens from `SQLITE_PATH`. Tests only. */
export function __resetDbForTests(): void {
  store?.close();
  store = null;
}

/** The open store, opening it if needed. Tests only. */
export function __storeForTests(): SqliteStore {
  return getStore();
}
