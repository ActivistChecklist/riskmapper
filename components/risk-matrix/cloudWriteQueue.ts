import {
  CloudConflictError,
  CloudNetworkError,
  CloudNotFoundError,
  CloudPayloadTooLargeError,
  CloudRollbackError,
  type MatrixCloudRepository,
} from "./matrixCloudRepository";
import type { CloudMatrixHandle } from "./matrixCloudRepository";
import type { RiskMatrixSnapshot } from "./matrixTypes";

/**
 * Coalescing, debounced write queue for cloud-backed matrices.
 *
 * - One in-flight request per recordId.
 * - While a write is in flight, the next call replaces the queued payload
 *   (so a flurry of edits collapses into one PUT after the current one).
 * - On 409 Conflict: surface a `CloudConflictError` to the caller via
 *   `onConflict` — caller decides whether to retry with the remote's version.
 * - On network errors: exponential backoff (capped) and retry the most
 *   recent payload.
 */

export type SyncState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "syncing" }
  | { kind: "offline"; nextRetryMs: number; attempt: number; message: string }
  | { kind: "conflict"; conflict: CloudConflictError }
  | { kind: "rollback"; message: string }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export type QueuedWrite = {
  handle: CloudMatrixHandle;
  snapshot: RiskMatrixSnapshot;
  title: string;
  expectedVersion: number;
  lamport: number;
};

export type CloudWriteQueueOptions = {
  repo: MatrixCloudRepository;
  /** Default 1500 ms. */
  debounceMs?: number;
  /** Initial backoff on network errors, default 1000 ms. */
  initialBackoffMs?: number;
  /** Maximum backoff, default 30000 ms (30s). */
  maxBackoffMs?: number;
  onState?: (state: SyncState) => void;
  /** Called when the server returned a fresher version than expected. */
  onSuccess?: (info: { recordId: string; version: number }) => void;
  /** Called when the queue parks on a conflict; caller resumes via `resolveConflict`. */
  onConflict?: (info: { recordId: string; conflict: CloudConflictError }) => void;
  /** Called when rollback was detected. */
  onRollback?: (info: { recordId: string; message: string }) => void;
  /** Called when a 404 was returned by the server (record gone). */
  onNotFound?: (info: { recordId: string }) => void;
  /** Optional clock for testability. */
  now?: () => number;
};

export type CloudWriteQueue = {
  enqueue(write: QueuedWrite): void;
  flush(): Promise<void>;
  /**
   * Replace expectedVersion+lamport for the next queued write — used when the
   * user accepts "keep mine and overwrite" after a 409.
   */
  resolveConflict(args: { expectedVersion: number; lamport: number }): void;
  /** Drop any pending work without writing (e.g., after the user disconnects sharing). */
  cancel(): void;
  /** Inspect — used by tests and the sync indicator. */
  getState(): SyncState;
};

export function createCloudWriteQueue(opts: CloudWriteQueueOptions): CloudWriteQueue {
  const debounceMs = opts.debounceMs ?? 1500;
  const initialBackoffMs = opts.initialBackoffMs ?? 1000;
  const maxBackoffMs = opts.maxBackoffMs ?? 30_000;
  const now = opts.now ?? (() => Date.now());

  let pending: QueuedWrite | null = null;
  let inFlight: QueuedWrite | null = null;
  // Re-read pending through this typed getter to defeat over-aggressive
  // post-await narrowing of the captured `pending` binding.
  const readPending = (): QueuedWrite | null => pending;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let backoffTimer: ReturnType<typeof setTimeout> | null = null;
  let backoffAttempt = 0;
  let parkedOnConflict = false;
  let state: SyncState = { kind: "idle" };
  // Authoritative latest server version observed by THIS queue. Updated on
  // every successful PUT and on resolveConflict. Used to override stale
  // `expectedVersion` values supplied by callers — React state can lag
  // across the post-write/next-edit boundary, so we never trust the
  // caller's value when we know the server has moved.
  let lastKnownVersion: number | null = null;

  function setState(next: SyncState): void {
    state = next;
    opts.onState?.(state);
  }

  function clearTimers(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (backoffTimer) {
      clearTimeout(backoffTimer);
      backoffTimer = null;
    }
  }

  function scheduleDrain(delayMs: number): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void drain();
    }, delayMs);
  }

  async function drain(): Promise<void> {
    if (inFlight) return;
    if (parkedOnConflict) return;
    if (!pending) return;
    const write = pending;
    pending = null;
    inFlight = write;
    setState({ kind: "syncing" });
    try {
      const out = await opts.repo.write(write);
      lastKnownVersion = out.version;
      backoffAttempt = 0;
      opts.onSuccess?.({ recordId: write.handle.recordId, version: out.version });
      inFlight = null;
      const enqueuedDuringFlight = readPending();
      if (enqueuedDuringFlight !== null) {
        // A fresh enqueue arrived during the flight; chain another write
        // with the freshly-incremented version.
        pending = { ...enqueuedDuringFlight, expectedVersion: out.version };
        setState({ kind: "pending" });
        scheduleDrain(0);
      } else {
        setState({ kind: "idle" });
      }
    } catch (err) {
      inFlight = null;
      if (err instanceof CloudConflictError) {
        parkedOnConflict = true;
        console.warn("[cloud-409] queue parked on conflict", {
          recordId: write.handle.recordId,
          sentExpectedVersion: write.expectedVersion,
          sentLamport: write.lamport,
          remoteVersion: err.conflict.remoteVersion,
          remoteLamport: err.conflict.remoteLamport,
          queueLastKnownVersion: lastKnownVersion,
        });
        setState({ kind: "conflict", conflict: err });
        opts.onConflict?.({ recordId: write.handle.recordId, conflict: err });
        return;
      }
      if (err instanceof CloudRollbackError) {
        const message = err.message;
        setState({ kind: "rollback", message });
        opts.onRollback?.({ recordId: write.handle.recordId, message });
        // Rollback is a stop-the-world condition; do not auto-retry.
        return;
      }
      if (err instanceof CloudNotFoundError) {
        setState({ kind: "missing" });
        opts.onNotFound?.({ recordId: write.handle.recordId });
        return;
      }
      if (err instanceof CloudPayloadTooLargeError) {
        // The next enqueue (with a smaller payload) will reset state to
        // "pending" and drain normally — no manual recovery needed.
        setState({ kind: "error", message: err.message });
        return;
      }
      // Treat everything else (network, 5xx, parse) as transient.
      backoffAttempt += 1;
      const delay = Math.min(
        initialBackoffMs * 2 ** (backoffAttempt - 1),
        maxBackoffMs,
      );
      const message =
        err instanceof CloudNetworkError ? err.message : "Sync failed; will retry.";
      setState({
        kind: "offline",
        attempt: backoffAttempt,
        nextRetryMs: now() + delay,
        message,
      });
      pending = pending ?? write;
      backoffTimer = setTimeout(() => {
        backoffTimer = null;
        void drain();
      }, delay);
    }
  }

  return {
    enqueue(write: QueuedWrite): void {
      if (parkedOnConflict) {
        // Hold the latest while the user resolves; resolveConflict() drains.
        pending = write;
        return;
      }
      // The caller's expectedVersion is computed from React state; if it's
      // older than what we already know the server is at, override.
      const expected =
        lastKnownVersion !== null && lastKnownVersion > write.expectedVersion
          ? lastKnownVersion
          : write.expectedVersion;
      if (expected !== write.expectedVersion) {
        console.info("[cloud] enqueue overrode caller expectedVersion", {
          recordId: write.handle.recordId,
          callerExpectedVersion: write.expectedVersion,
          queueLastKnownVersion: lastKnownVersion,
          using: expected,
        });
      }
      pending =
        expected === write.expectedVersion
          ? write
          : { ...write, expectedVersion: expected };
      setState({ kind: "pending" });
      scheduleDrain(debounceMs);
    },

    async flush(): Promise<void> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (backoffTimer) {
        // flush() takes precedence over backoff: cancel the deferred retry
        // and drain immediately on the caller's behalf.
        clearTimeout(backoffTimer);
        backoffTimer = null;
        backoffAttempt = 0;
      }
      if (parkedOnConflict) return;
      while (inFlight) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }
      while (pending && !parkedOnConflict) {
        await drain();
      }
    },

    resolveConflict(args: { expectedVersion: number; lamport: number }): void {
      console.info("[cloud] queue.resolveConflict", {
        expectedVersion: args.expectedVersion,
        lamport: args.lamport,
        hadPending: !!pending,
      });
      parkedOnConflict = false;
      // Trust the caller's resolved version as the authoritative value.
      lastKnownVersion = args.expectedVersion;
      if (!pending) {
        setState({ kind: "idle" });
        return;
      }
      pending = { ...pending, expectedVersion: args.expectedVersion, lamport: args.lamport };
      setState({ kind: "pending" });
      scheduleDrain(0);
    },

    cancel(): void {
      clearTimers();
      pending = null;
      backoffAttempt = 0;
      parkedOnConflict = false;
      lastKnownVersion = null;
      setState({ kind: "idle" });
    },

    getState(): SyncState {
      return state;
    },
  };
}
