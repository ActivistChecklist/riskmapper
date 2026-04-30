"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMatrixCloudRepository,
  type CloudConflictError,
  type MatrixCloudRepository,
} from "./matrixCloudRepository";
import {
  createCloudWriteQueue,
  type CloudWriteQueue,
  type SyncState,
} from "./cloudWriteQueue";
import { keyFromB64, SCHEMA_VERSION } from "@/lib/e2ee";
import type { CloudMatrixMeta, RiskMatrixSnapshot } from "./matrixTypes";

/**
 * React glue around the cloud write queue. Owns one queue per active cloud
 * record id; rebuilds the queue when the active record changes. Manages the
 * lamport counter, conflict state, and exposes the repo to UI components.
 *
 * The hook does not own the active matrix's snapshot — it just receives
 * pushes via `enqueueWrite`. The workspace hook calls this whenever the
 * persisted local snapshot for a cloud-backed matrix changes.
 */
export type UseCloudSyncManagerResult = {
  syncState: SyncState;
  pendingConflict: CloudConflictError | null;
  enqueueWrite: (args: {
    cloud: CloudMatrixMeta;
    snapshot: RiskMatrixSnapshot;
    title: string;
  }) => void;
  flush: () => Promise<void>;
  cancel: () => void;
  /** Caller resolves the conflict by picking expectedVersion + lamport. */
  resolveConflict: (args: { expectedVersion: number; lamport: number }) => void;
  /** Dismiss the conflict modal, leaving the queue parked + indicator sticky. */
  acknowledge: () => void;
  /** If the queue is parked on a conflict, re-surface it so the dialog re-opens. */
  reopenConflict: () => void;
  repo: MatrixCloudRepository;
  /** Latest version & lamport for the active record after a successful sync. */
  lastSynced: { version: number; lamport: number } | null;
};

export function useCloudSyncManager(): UseCloudSyncManagerResult {
  const repo = useMemo(() => createMatrixCloudRepository(), []);
  const queueRef = useRef<CloudWriteQueue | null>(null);
  const activeRecordRef = useRef<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({ kind: "idle" });
  const [pendingConflict, setPendingConflict] =
    useState<CloudConflictError | null>(null);
  const [lastSynced, setLastSynced] = useState<{ version: number; lamport: number } | null>(null);
  const lamportRef = useRef<number>(0);

  const ensureQueueFor = useCallback((cloud: CloudMatrixMeta) => {
    if (activeRecordRef.current === cloud.recordId && queueRef.current) {
      return queueRef.current;
    }
    queueRef.current?.cancel();
    activeRecordRef.current = cloud.recordId;
    lamportRef.current = cloud.lastSyncedLamport;
    setLastSynced({
      version: cloud.lastSyncedVersion,
      lamport: cloud.lastSyncedLamport,
    });
    setPendingConflict(null);
    setSyncState({ kind: "idle" });
    queueRef.current = createCloudWriteQueue({
      repo,
      onState: (s) => setSyncState(s),
      onSuccess: ({ version }) => {
        setLastSynced({ version, lamport: lamportRef.current });
      },
      onConflict: ({ conflict }) => setPendingConflict(conflict),
      onRollback: () => setPendingConflict(null),
      onNotFound: () => setPendingConflict(null),
    });
    return queueRef.current;
  }, [repo]);

  const enqueueWrite = useCallback(
    ({
      cloud,
      snapshot,
      title,
    }: {
      cloud: CloudMatrixMeta;
      snapshot: RiskMatrixSnapshot;
      title: string;
    }) => {
      const q = ensureQueueFor(cloud);
      const keyBytes = keyFromB64(cloud.keyB64);
      const handle = {
        recordId: cloud.recordId,
        key: keyBytes,
        schemaVersion: SCHEMA_VERSION,
      };
      lamportRef.current = lamportRef.current + 1;
      q.enqueue({
        handle,
        snapshot,
        title,
        expectedVersion: lastSynced?.version ?? cloud.lastSyncedVersion,
        lamport: lamportRef.current,
      });
    },
    [ensureQueueFor, lastSynced?.version],
  );

  const flush = useCallback(async () => {
    await queueRef.current?.flush();
  }, []);

  const cancel = useCallback(() => {
    queueRef.current?.cancel();
    activeRecordRef.current = null;
    queueRef.current = null;
    setPendingConflict(null);
    setSyncState({ kind: "idle" });
    setLastSynced(null);
  }, []);

  const resolveConflict = useCallback(
    (args: { expectedVersion: number; lamport: number }) => {
      setPendingConflict(null);
      lamportRef.current = args.lamport;
      queueRef.current?.resolveConflict(args);
    },
    [],
  );

  const reopenConflict = useCallback(() => {
    const s = queueRef.current?.getState();
    if (s && s.kind === "conflict") {
      setPendingConflict(s.conflict);
    }
  }, []);

  const acknowledge = useCallback(() => {
    // Clear only the modal-driving `pendingConflict`. We deliberately do NOT
    // reset `syncState` here: when the underlying queue is parked on a
    // conflict (or in a rollback / missing / error state) dismissing the
    // dialog should leave the indicator visibly stuck so the user can re-open
    // it via reopenConflict().
    setPendingConflict(null);
  }, []);

  useEffect(() => {
    return () => {
      queueRef.current?.cancel();
    };
  }, []);

  return useMemo(
    () => ({
      syncState,
      pendingConflict,
      enqueueWrite,
      flush,
      cancel,
      resolveConflict,
      acknowledge,
      reopenConflict,
      repo,
      lastSynced,
    }),
    [
      syncState,
      pendingConflict,
      enqueueWrite,
      flush,
      cancel,
      resolveConflict,
      acknowledge,
      reopenConflict,
      repo,
      lastSynced,
    ],
  );
}
