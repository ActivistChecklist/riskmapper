"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import {
  CloudNetworkError,
  CloudNotFoundError,
  CloudPayloadTooLargeError,
  createMatrixCloudRepository,
  type CloudMatrixHandle,
  type MatrixCloudRepository,
  type Subscription,
} from "./matrixCloudRepository";
import {
  base64urlDecode,
  base64urlEncode,
  keyFromB64,
  SCHEMA_VERSION,
} from "@/lib/e2ee";
import type { CloudMatrixMeta } from "./matrixTypes";
import type { SyncState } from "./CloudSyncIndicator";

/**
 * Live cloud-sync hook for the active matrix.
 *
 * Owns one Y.Doc per active record. When `activeMeta` changes, the hook:
 *   1. Hydrates a fresh Y.Doc from the persisted `yDocStateB64`.
 *   2. Opens an SSE subscription with `sinceSeq = lastHeadSeq`.
 *   3. Fetches `read({ sinceSeq: lastHeadSeq })` and applies baseline +
 *      catch-up updates with `origin: "remote"`.
 *   4. Listens for local `doc.on("update", origin)` events and ships
 *      `origin !== "remote"` updates through the append outbox.
 *
 * The outbox merges queued updates with `Y.mergeUpdates` so a flurry of
 * local edits collapses into one POST. On network error it retries with
 * exponential backoff capped at 30s; the queued bytes are preserved
 * across retries. Successful appends advance `lastHeadSeq` and persist
 * the encoded Y.Doc state back through `onMetaUpdate`.
 *
 * `onChange` fires after every applyUpdate from baseline / catch-up /
 * live SSE so the consumer can re-render against the freshly-mutated
 * doc.
 *
 * No `expectedVersion`, no 409, no conflict UI — convergence is Yjs's
 * job.
 */

const REMOTE_ORIGIN = "remote";
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

type Live = {
  handle: CloudMatrixHandle;
  doc: Y.Doc;
  clientId: string;
  lastHeadSeq: number;
  pending: Uint8Array | null;
  inFlight: boolean;
  backoffMs: number;
  backoffTimer: ReturnType<typeof setTimeout> | null;
  subscription: Subscription | null;
  cancelled: boolean;
  waiters: Array<{ resolve: () => void; reject: (err: Error) => void }>;
};

export type UseCloudMatrixCallbacks = {
  /** Persist the new meta (advances `lastHeadSeq`, refreshes `yDocStateB64`). */
  onMetaUpdate?: (recordId: string, meta: CloudMatrixMeta) => void;
  /** Fired after the Y.Doc state mutates from any source. */
  onChange?: (doc: Y.Doc) => void;
};

export type UseCloudMatrixResult = {
  syncState: SyncState;
  repo: MatrixCloudRepository;
  /** The live Y.Doc for the active record, or null when no cloud is wired. */
  doc: Y.Doc | null;
  /** Wait for the outbox to drain (or fail). */
  flush: () => Promise<void>;
  /** Tear down the active subscription + Y.Doc without writing. */
  cancel: () => void;
  /** Clear sticky terminal states (missing/error) on user dismiss. */
  acknowledge: () => void;
  /** No-op — kept for symmetry with the old conflict-aware API. */
  reopenAction: () => void;
};

export function useCloudMatrix(
  activeMeta: CloudMatrixMeta | null,
  callbacks: UseCloudMatrixCallbacks = {},
): UseCloudMatrixResult {
  const repo = useMemo(() => createMatrixCloudRepository(), []);

  const liveRef = useRef<Live | null>(null);
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const [syncState, setSyncState] = useState<SyncState>({ kind: "idle" });
  const [doc, setDoc] = useState<Y.Doc | null>(null);

  // Build / tear down per active matrix. State setters fire here in
  // response to identity changes (active record swap, unmount); the lint
  // rule's heuristic doesn't model that lifecycle pattern.
  useEffect(() => {
    if (!activeMeta) {
      teardown(liveRef.current);
      liveRef.current = null;
      /* eslint-disable react-hooks/set-state-in-effect */
      setDoc(null);
      setSyncState({ kind: "idle" });
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    setSyncState({ kind: "loading" });

    const handle: CloudMatrixHandle = {
      recordId: activeMeta.recordId,
      key: activeMeta.keyB64
        ? keyFromB64(activeMeta.keyB64)
        : new Uint8Array(0),
      schemaVersion: SCHEMA_VERSION,
    };

    const yDoc = new Y.Doc();
    if (activeMeta.yDocStateB64) {
      try {
        Y.applyUpdate(yDoc, base64urlDecode(activeMeta.yDocStateB64), REMOTE_ORIGIN);
      } catch {
        // Corrupt local snapshot — start from empty and let the server
        // re-hydrate via baseline + updates.
      }
    }

    const live: Live = {
      handle,
      doc: yDoc,
      clientId: String(yDoc.clientID),
      lastHeadSeq: activeMeta.lastHeadSeq,
      pending: null,
      inFlight: false,
      backoffMs: INITIAL_BACKOFF_MS,
      backoffTimer: null,
      subscription: null,
      cancelled: false,
      waiters: [],
    };
    liveRef.current = live;
    setDoc(yDoc);

    const onLocalUpdate = (update: Uint8Array, origin: unknown): void => {
      if (live.cancelled) return;
      if (origin === REMOTE_ORIGIN) return;
      live.pending = live.pending
        ? Y.mergeUpdates([live.pending, update])
        : update;
      void drainOutbox(live, repo, setSyncState, callbacksRef);
    };
    yDoc.on("update", onLocalUpdate);

    const cleanup = () => {
      live.cancelled = true;
      yDoc.off("update", onLocalUpdate);
      teardown(live);
    };

    // Subscribe FIRST so live updates that arrive during the read aren't
    // missed. The repo subscription itself dedupes by `seq <= sinceSeq`.
    live.subscription = repo.subscribe(
      { handle, sinceSeq: activeMeta.lastHeadSeq },
      {
        onUpdate(event) {
          if (live.cancelled) return;
          Y.applyUpdate(yDoc, event.bytes, REMOTE_ORIGIN);
          if (event.seq > live.lastHeadSeq) {
            live.lastHeadSeq = event.seq;
            persistMetaFromLive(live, callbacksRef);
          }
          callbacksRef.current.onChange?.(yDoc);
        },
        onError() {
          if (live.cancelled) return;
          // EventSource auto-reconnects; reflect the disruption in the UI
          // but don't tear down the doc.
          setSyncState({
            kind: "offline",
            attempt: 1,
            message: "Reconnecting to live updates…",
          });
        },
        onOpen() {
          if (live.cancelled) return;
          // Only restore from `offline` — leave syncing/loading alone.
          setSyncState((s) => (s.kind === "offline" ? { kind: "idle" } : s));
        },
      },
    );

    // Fetch baseline + catch-up.
    void (async () => {
      try {
        const remote = await repo.read(handle, { sinceSeq: activeMeta.lastHeadSeq });
        if (live.cancelled) return;
        if (remote.baseline) {
          // The server returned a baseline, meaning either we passed no
          // `since` or the server's baseline is newer than what we asked.
          // Apply it on top of the locally-hydrated doc — Yjs merges are
          // idempotent, so re-applying state we already have is a no-op.
          Y.applyUpdate(yDoc, remote.baseline, REMOTE_ORIGIN);
        }
        for (const u of remote.updates) {
          Y.applyUpdate(yDoc, u.bytes, REMOTE_ORIGIN);
          if (u.seq > live.lastHeadSeq) live.lastHeadSeq = u.seq;
        }
        persistMetaFromLive(live, callbacksRef);
        callbacksRef.current.onChange?.(yDoc);
        setSyncState({ kind: "idle" });
      } catch (err) {
        if (live.cancelled) return;
        if (err instanceof CloudNotFoundError) {
          setSyncState({ kind: "missing" });
        } else {
          const message =
            err instanceof Error ? err.message : "Failed to load matrix.";
          setSyncState({ kind: "error", message });
        }
      }
    })();

    return cleanup;
    // Only the meta identity (recordId + keyB64) drives a rebuild — we
    // intentionally don't depend on the full `activeMeta` object since
    // its non-identity fields (lastHeadSeq, yDocStateB64) update through
    // the bridge after every successful append.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMeta?.recordId, activeMeta?.keyB64, repo]);

  const flush = useCallback(async (): Promise<void> => {
    const live = liveRef.current;
    if (!live) return;
    if (!live.pending && !live.inFlight) return;
    return new Promise<void>((resolve, reject) => {
      live.waiters.push({ resolve, reject });
      void drainOutbox(live, repo, setSyncState, callbacksRef);
    });
  }, [repo]);

  const cancel = useCallback(() => {
    teardown(liveRef.current);
    liveRef.current = null;
    setDoc(null);
    setSyncState({ kind: "idle" });
  }, []);

  const acknowledge = useCallback(() => {
    setSyncState((s) =>
      s.kind === "missing" || s.kind === "error" || s.kind === "rollback"
        ? { kind: "idle" }
        : s,
    );
  }, []);

  const reopenAction = useCallback(() => {
    // Nothing to re-open in the no-conflict model. Kept for API parity.
  }, []);

  return {
    syncState,
    repo,
    doc,
    flush,
    cancel,
    acknowledge,
    reopenAction,
  };
}

// — module-level helpers (named functions self-reference fine) —

function persistMetaFromLive(
  live: Live,
  callbacksRef: { current: UseCloudMatrixCallbacks },
): void {
  const cb = callbacksRef.current.onMetaUpdate;
  if (!cb) return;
  const stateBytes = Y.encodeStateAsUpdate(live.doc);
  cb(live.handle.recordId, {
    recordId: live.handle.recordId,
    keyB64: base64urlEncode(live.handle.key),
    lastHeadSeq: live.lastHeadSeq,
    yDocStateB64: base64urlEncode(stateBytes),
  });
}

async function drainOutbox(
  live: Live,
  repo: MatrixCloudRepository,
  setSyncState: (s: SyncState | ((prev: SyncState) => SyncState)) => void,
  callbacksRef: { current: UseCloudMatrixCallbacks },
): Promise<void> {
  if (live.cancelled) return;
  if (live.inFlight) return;
  if (!live.pending) return;
  live.inFlight = true;
  setSyncState({ kind: "syncing" });
  const send = live.pending;
  live.pending = null;
  try {
    const { seq } = await repo.appendUpdate({
      handle: live.handle,
      bytes: send,
      clientId: live.clientId,
    });
    if (live.cancelled) return;
    live.backoffMs = INITIAL_BACKOFF_MS;
    if (seq > live.lastHeadSeq) {
      live.lastHeadSeq = seq;
    }
    persistMetaFromLive(live, callbacksRef);
    live.inFlight = false;
    for (const w of live.waiters.splice(0)) w.resolve();
    if (live.pending) {
      void drainOutbox(live, repo, setSyncState, callbacksRef);
    } else {
      setSyncState({ kind: "idle" });
    }
  } catch (err) {
    if (live.cancelled) return;
    live.inFlight = false;
    if (err instanceof CloudNotFoundError) {
      setSyncState({ kind: "missing" });
      for (const w of live.waiters.splice(0)) {
        w.reject(err instanceof Error ? err : new Error(String(err)));
      }
      return;
    }
    if (err instanceof CloudPayloadTooLargeError) {
      setSyncState({ kind: "error", message: err.message });
      for (const w of live.waiters.splice(0)) w.reject(err);
      return;
    }
    // Transient: re-queue and back off.
    live.pending = live.pending
      ? Y.mergeUpdates([send, live.pending])
      : send;
    const message =
      err instanceof CloudNetworkError ? err.message : "Sync failed; will retry.";
    const delay = live.backoffMs;
    live.backoffMs = Math.min(live.backoffMs * 2, MAX_BACKOFF_MS);
    setSyncState({
      kind: "offline",
      attempt: Math.round(Math.log2(delay / INITIAL_BACKOFF_MS)) + 1,
      message,
    });
    if (live.backoffTimer) clearTimeout(live.backoffTimer);
    live.backoffTimer = setTimeout(() => {
      live.backoffTimer = null;
      if (live.cancelled) return;
      void drainOutbox(live, repo, setSyncState, callbacksRef);
    }, delay);
  }
}

function teardown(live: Live | null): void {
  if (!live) return;
  live.cancelled = true;
  if (live.backoffTimer) {
    clearTimeout(live.backoffTimer);
    live.backoffTimer = null;
  }
  live.subscription?.close();
  live.subscription = null;
  for (const w of live.waiters.splice(0)) {
    w.reject(new Error("Cloud sync cancelled."));
  }
}
