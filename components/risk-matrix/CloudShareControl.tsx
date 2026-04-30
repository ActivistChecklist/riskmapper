"use client";

import React, { useCallback, useState } from "react";
import { Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { keyFromB64, keyToB64, SCHEMA_VERSION } from "@/lib/e2ee";
import CloudSyncIndicator from "./CloudSyncIndicator";
import ShareMatrixDialog from "./ShareMatrixDialog";
import type {
  CloudMatrixHandle,
  MatrixCloudRepository,
} from "./matrixCloudRepository";
import type { SyncState } from "./cloudWriteQueue";
import type { CloudMatrixMeta, RiskMatrixSnapshot } from "./matrixTypes";

export type CloudShareControlProps = {
  /** Snapshot getter for "fresh share" creation. */
  getSnapshot: () => RiskMatrixSnapshot | null;
  matrixTitle: string;
  /** Active saved matrix's cloud meta, if it has one. */
  cloudMeta: CloudMatrixMeta | null;
  /** Sync state of the active matrix's queue (idle/pending/syncing/etc). */
  syncState: SyncState;
  repo: MatrixCloudRepository;
  /** Persist new cloud meta (sets keyB64, recordId, lastSyncedVersion/Lamport). */
  onCloudMetaSet: (meta: CloudMatrixMeta) => void;
  /** Drop cloud meta locally and DELETE the server record. */
  onStopSharing: () => Promise<void> | void;
  /** Reset rollback / error state once dismissed. */
  onAcknowledge: () => void;
  /** Re-open the conflict dialog if the queue is parked on a conflict. */
  onIndicatorAction?: () => void;
  /** Disabled when there's no active saved matrix to share. */
  disabled?: boolean;
};

/**
 * Toolbar control: "Share" button + dialog + sync indicator.
 *
 * For unshared matrices: shows a "Share" button. Click opens the dialog,
 * which (on confirm) creates a cloud record, stores the key locally as
 * keyB64, and shows the link. The local keyB64 is only persisted after
 * this explicit user action.
 *
 * For shared matrices: shows the sync indicator + "Manage sharing" button.
 * Click re-opens the dialog so the user can copy the link or stop sharing.
 */
export default function CloudShareControl({
  getSnapshot,
  matrixTitle,
  cloudMeta,
  syncState,
  repo,
  onCloudMetaSet,
  onStopSharing,
  onAcknowledge,
  onIndicatorAction,
  disabled,
}: CloudShareControlProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempHandle, setTempHandle] = useState<CloudMatrixHandle | null>(null);

  const existingHandle =
    cloudMeta && cloudMeta.keyB64
      ? {
          recordId: cloudMeta.recordId,
          key: keyFromB64(cloudMeta.keyB64),
          schemaVersion: SCHEMA_VERSION,
        }
      : null;

  const dialogHandle = existingHandle ?? tempHandle;

  const onConfirmShare = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const snap = getSnapshot();
      if (!snap) {
        setError("No matrix snapshot to share.");
        return;
      }
      const created = await repo.create({ snapshot: snap, title: matrixTitle });
      setTempHandle(created.handle);
      onCloudMetaSet({
        recordId: created.handle.recordId,
        keyB64: keyToB64(created.handle.key),
        lastSyncedVersion: created.version,
        lastSyncedLamport: 1,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to share matrix.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [getSnapshot, matrixTitle, onCloudMetaSet, repo]);

  const handleStopSharing = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await onStopSharing();
      setTempHandle(null);
      setOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to stop sharing.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [onStopSharing]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        setError(null);
        // Keep tempHandle so dialog state is consistent on re-open within
        // the same session.
        onAcknowledge();
      }
    },
    [onAcknowledge],
  );

  return (
    <>
      {cloudMeta ? (
        <CloudSyncIndicator state={syncState} onAction={onIndicatorAction} />
      ) : null}
      <Button
        type="button"
        variant={cloudMeta ? "outline" : "primary"}
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Share2 className="size-4" aria-hidden />
        )}
        {busy ? "Sharing…" : cloudMeta ? "Manage sharing" : "Share"}
      </Button>
      <ShareMatrixDialog
        open={open}
        onOpenChange={onOpenChange}
        matrixTitle={matrixTitle}
        handle={dialogHandle}
        loading={busy}
        error={error}
        onConfirmShare={() => void onConfirmShare()}
        onStopSharing={() => void handleStopSharing()}
      />
    </>
  );
}
