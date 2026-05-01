"use client";

import { useCallback, useMemo, useState } from "react";
import {
  createMatrixCloudRepository,
  type MatrixCloudRepository,
} from "./matrixCloudRepository";
import type { SyncState } from "./CloudSyncIndicator";

/**
 * Cloud-sync hook for the active matrix.
 *
 * STAGE 1 (current): owns a singleton MatrixCloudRepository so the share-
 * create / share-read / share-delete flows work over the new transport.
 * Live two-way sync (a Y.Doc per active matrix, SSE subscription, append
 * outbox) is the next iteration — see TODO below.
 *
 * The exported shape mirrors the previous useCloudSyncManager so consumer
 * components don't have to change as the live-sync bits land.
 */
export type UseCloudMatrixResult = {
  syncState: SyncState;
  repo: MatrixCloudRepository;
  acknowledge: () => void;
  /** No-op until the live-sync layer lands. */
  reopenAction: () => void;
  /** No-op until the live-sync layer lands. */
  cancel: () => void;
};

export function useCloudMatrix(): UseCloudMatrixResult {
  const repo = useMemo(() => createMatrixCloudRepository(), []);
  const [syncState] = useState<SyncState>({ kind: "idle" });
  // TODO(step 3b): plumb the Y.Doc + SSE subscription + append outbox here.
  // The active matrix's CloudMatrixMeta drives the lifecycle: when it
  // changes, build a fresh Y.Doc, hydrate from `yDocStateB64`, fetch
  // updates `?since=lastHeadSeq`, subscribe to /events, and ship local
  // doc.on("update") updates via repo.appendUpdate.

  const acknowledge = useCallback(() => {
    // No persistent error state to acknowledge yet.
  }, []);
  const reopenAction = useCallback(() => {
    // Nothing to re-open until live-sync surface states do.
  }, []);
  const cancel = useCallback(() => {
    // Subscription teardown lands with step 3b.
  }, []);

  return { syncState, repo, acknowledge, reopenAction, cancel };
}
