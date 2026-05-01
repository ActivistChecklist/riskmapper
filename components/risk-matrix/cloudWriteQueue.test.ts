import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION } from "@/lib/e2ee";
import {
  CloudConflictError,
  CloudNetworkError,
  CloudNotFoundError,
  CloudRollbackError,
  type MatrixCloudRepository,
} from "./matrixCloudRepository";
import { createCloudWriteQueue } from "./cloudWriteQueue";
import type { RiskMatrixSnapshot } from "./matrixTypes";

const SAMPLE_SNAP: RiskMatrixSnapshot = {
  pool: [],
  grid: {},
  collapsed: { red: false, orange: false, yellow: false, green: false },
  otherActions: [],
  hiddenCategorizedRiskKeys: [],
  categorizedRevealHidden: { red: false, orange: false, yellow: false, green: false },
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeRepo(behavior: {
  writeImpl: MatrixCloudRepository["write"];
}): MatrixCloudRepository {
  return {
    create: async () => {
      throw new Error("not used in queue tests");
    },
    read: async () => {
      throw new Error("not used in queue tests");
    },
    write: behavior.writeImpl,
    delete: async () => {},
  };
}

const HANDLE = {
  recordId: "rec-1",
  key: new Uint8Array(32),
  schemaVersion: SCHEMA_VERSION,
};

describe("cloudWriteQueue", () => {
  it("debounces multiple enqueues into a single PUT", async () => {
    const writeFn = vi
      .fn<MatrixCloudRepository["write"]>()
      .mockResolvedValue({ version: 2, lastWriteDate: null });
    const q = createCloudWriteQueue({ repo: makeRepo({ writeImpl: writeFn }), debounceMs: 1500 });

    q.enqueue({ handle: HANDLE, snapshot: SAMPLE_SNAP, title: "a", expectedVersion: 1, lamport: 1 });
    q.enqueue({ handle: HANDLE, snapshot: SAMPLE_SNAP, title: "ab", expectedVersion: 1, lamport: 2 });
    q.enqueue({ handle: HANDLE, snapshot: SAMPLE_SNAP, title: "abc", expectedVersion: 1, lamport: 3 });

    expect(writeFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);

    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(writeFn.mock.calls[0][0].title).toBe("abc");
    expect(writeFn.mock.calls[0][0].lamport).toBe(3);
  });

  it("coalesces an edit arriving during a flight", async () => {
    let resolveFirst!: () => void;
    const firstResult = new Promise<{ version: number; lastWriteDate: null }>((r) => {
      resolveFirst = () => r({ version: 2, lastWriteDate: null });
    });
    const writeFn = vi
      .fn<MatrixCloudRepository["write"]>()
      .mockImplementationOnce(() => firstResult)
      .mockImplementationOnce(async () => ({ version: 3, lastWriteDate: null }));

    const q = createCloudWriteQueue({ repo: makeRepo({ writeImpl: writeFn }), debounceMs: 100 });

    q.enqueue({ handle: HANDLE, snapshot: SAMPLE_SNAP, title: "first", expectedVersion: 1, lamport: 1 });
    await vi.advanceTimersByTimeAsync(100);

    q.enqueue({ handle: HANDLE, snapshot: SAMPLE_SNAP, title: "second", expectedVersion: 999, lamport: 2 });
    q.enqueue({ handle: HANDLE, snapshot: SAMPLE_SNAP, title: "third", expectedVersion: 999, lamport: 3 });
    expect(writeFn).toHaveBeenCalledTimes(1);

    resolveFirst();
    await vi.advanceTimersByTimeAsync(0);

    expect(writeFn).toHaveBeenCalledTimes(2);
    // The second flight uses the version returned from the first (2), not the
    // stale `999` the caller had typed in.
    expect(writeFn.mock.calls[1][0].expectedVersion).toBe(2);
    expect(writeFn.mock.calls[1][0].title).toBe("third");
  });

  it("ignores a stale caller expectedVersion when the server is known to be ahead", async () => {
    // Reproduces the post-success conflict-loop bug: the React closure that
    // computes `expectedVersion` lags behind the queue's actual knowledge
    // for a render or two after a successful write. The queue must not
    // re-send a stale version.
    const writeFn = vi
      .fn<MatrixCloudRepository["write"]>()
      .mockResolvedValueOnce({ version: 2, lastWriteDate: null })
      .mockResolvedValueOnce({ version: 3, lastWriteDate: null });

    const q = createCloudWriteQueue({
      repo: makeRepo({ writeImpl: writeFn }),
      debounceMs: 0,
    });

    // 1st write succeeds; queue learns server is at version 2.
    q.enqueue({ handle: HANDLE, snapshot: SAMPLE_SNAP, title: "a", expectedVersion: 1, lamport: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(writeFn.mock.calls[0][0].expectedVersion).toBe(1);

    // 2nd enqueue arrives with a STALE expectedVersion (caller's React
    // state hasn't caught up). The queue must override it to 2.
    q.enqueue({ handle: HANDLE, snapshot: SAMPLE_SNAP, title: "b", expectedVersion: 1, lamport: 2 });
    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledTimes(2);
    expect(writeFn.mock.calls[1][0].expectedVersion).toBe(2);
  });

  it("parks on 409 and resumes via resolveConflict()", async () => {
    const conflict = new CloudConflictError({
      remoteCiphertext: "v1.AAAA",
      remoteVersion: 9,
      remoteLamport: 9,
    });
    const writeFn = vi
      .fn<MatrixCloudRepository["write"]>()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ version: 10, lastWriteDate: null });

    const onConflict = vi.fn();
    const q = createCloudWriteQueue({
      repo: makeRepo({ writeImpl: writeFn }),
      debounceMs: 0,
      onConflict,
    });

    q.enqueue({ handle: HANDLE, snapshot: SAMPLE_SNAP, title: "a", expectedVersion: 1, lamport: 1 });
    await vi.advanceTimersByTimeAsync(0);

    expect(onConflict).toHaveBeenCalledOnce();
    expect(q.getState()).toMatchObject({ kind: "conflict" });

    q.enqueue({ handle: HANDLE, snapshot: SAMPLE_SNAP, title: "still mine", expectedVersion: 1, lamport: 2 });
    expect(writeFn).toHaveBeenCalledTimes(1);

    q.resolveConflict({ expectedVersion: 9, lamport: 10 });
    await vi.advanceTimersByTimeAsync(0);

    expect(writeFn).toHaveBeenCalledTimes(2);
    expect(writeFn.mock.calls[1][0].expectedVersion).toBe(9);
    expect(writeFn.mock.calls[1][0].lamport).toBe(10);
    expect(q.getState()).toMatchObject({ kind: "idle" });
  });

  it("backs off exponentially on transient network errors", async () => {
    const writeFn = vi
      .fn<MatrixCloudRepository["write"]>()
      .mockRejectedValueOnce(new CloudNetworkError("net 1", 503))
      .mockRejectedValueOnce(new CloudNetworkError("net 2", 503))
      .mockResolvedValueOnce({ version: 2, lastWriteDate: null });

    const states: string[] = [];
    const q = createCloudWriteQueue({
      repo: makeRepo({ writeImpl: writeFn }),
      debounceMs: 0,
      initialBackoffMs: 1000,
      maxBackoffMs: 30_000,
      onState: (s) => states.push(s.kind),
    });

    q.enqueue({ handle: HANDLE, snapshot: SAMPLE_SNAP, title: "a", expectedVersion: 1, lamport: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(q.getState().kind).toBe("offline");

    await vi.advanceTimersByTimeAsync(1000);
    expect(writeFn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2000);
    expect(writeFn).toHaveBeenCalledTimes(3);
    expect(q.getState().kind).toBe("idle");
    expect(states.includes("offline")).toBe(true);
    expect(states.includes("syncing")).toBe(true);
  });

  it("stops on rollback error and surfaces it", async () => {
    const writeFn = vi
      .fn<MatrixCloudRepository["write"]>()
      .mockRejectedValueOnce(new CloudRollbackError("Rolled back"));
    const onRollback = vi.fn();
    const q = createCloudWriteQueue({
      repo: makeRepo({ writeImpl: writeFn }),
      debounceMs: 0,
      onRollback,
    });

    q.enqueue({ handle: HANDLE, snapshot: SAMPLE_SNAP, title: "a", expectedVersion: 1, lamport: 1 });
    await vi.advanceTimersByTimeAsync(0);

    expect(onRollback).toHaveBeenCalledOnce();
    expect(q.getState()).toMatchObject({ kind: "rollback" });
    // No automatic retry.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(writeFn).toHaveBeenCalledTimes(1);
  });

  it("stops on 404 (record gone) and surfaces it", async () => {
    const writeFn = vi
      .fn<MatrixCloudRepository["write"]>()
      .mockRejectedValueOnce(new CloudNotFoundError());
    const onNotFound = vi.fn();
    const q = createCloudWriteQueue({
      repo: makeRepo({ writeImpl: writeFn }),
      debounceMs: 0,
      onNotFound,
    });
    q.enqueue({ handle: HANDLE, snapshot: SAMPLE_SNAP, title: "a", expectedVersion: 1, lamport: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(onNotFound).toHaveBeenCalledOnce();
    expect(q.getState()).toMatchObject({ kind: "missing" });
  });

  it("cancel() drops pending work without writing", async () => {
    const writeFn = vi
      .fn<MatrixCloudRepository["write"]>()
      .mockResolvedValue({ version: 2, lastWriteDate: null });
    const q = createCloudWriteQueue({ repo: makeRepo({ writeImpl: writeFn }), debounceMs: 1500 });
    q.enqueue({ handle: HANDLE, snapshot: SAMPLE_SNAP, title: "a", expectedVersion: 1, lamport: 1 });
    q.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(writeFn).not.toHaveBeenCalled();
    expect(q.getState()).toMatchObject({ kind: "idle" });
  });
});
