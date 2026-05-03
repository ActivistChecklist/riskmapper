"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import * as Y from "yjs";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { keyFromB64, keyToB64, SCHEMA_VERSION } from "@/lib/e2ee";
import ShareMatrixDialog from "./ShareMatrixDialog";
import { seedYDoc } from "./matrixYDoc";
import { encodeYDocStateForMeta } from "./useShareImport";
import type {
  CloudMatrixHandle,
  MatrixCloudRepository,
} from "./matrixCloudRepository";
import type { CloudMatrixMeta, RiskMatrixSnapshot } from "./matrixTypes";

export type CloudShareControlProps = {
  /** Snapshot getter for "fresh share" creation. */
  getSnapshot: () => RiskMatrixSnapshot | null;
  matrixTitle: string;
  /** Active saved matrix's cloud meta, if it has one. */
  cloudMeta: CloudMatrixMeta | null;
  repo: MatrixCloudRepository;
  /** Persist new cloud meta after successful share creation. */
  onCloudMetaSet: (meta: CloudMatrixMeta) => void;
  /** Drop cloud meta locally and DELETE the server record. */
  onStopSharing: () => Promise<void> | void;
  /** Reset error state once dismissed. */
  onAcknowledge: () => void;
  /** Disabled when there's no active saved matrix to share. */
  disabled?: boolean;
};

/**
 * Top-bar Share button + dialog. The button always reads "Share"
 * (Google-Docs-style affordance) regardless of whether the matrix is
 * already shared. Clicking it opens the dialog; the dialog itself
 * adapts: unshared → "Confirm share" flow that creates a cloud record;
 * already-shared → "Copy link" + "Stop sharing" affordances. The live
 * sync indicator (Synced / Syncing / Offline) lives next to the title
 * via MatrixStatusIndicator — not duplicated here.
 */
export default function CloudShareControl({
  getSnapshot,
  matrixTitle,
  cloudMeta,
  repo,
  onCloudMetaSet,
  onStopSharing,
  onAcknowledge,
  disabled,
}: CloudShareControlProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempHandle, setTempHandle] = useState<CloudMatrixHandle | null>(null);
  // Derive the existing handle in an effect since libsodium's
  // constant-time keyFromB64 is async. Until it resolves, fall back to
  // `tempHandle`; for a saved cloud matrix this just means the dialog
  // briefly shows no link before the WASM finishes loading.
  const [existingHandle, setExistingHandle] =
    useState<CloudMatrixHandle | null>(null);
  const cloudMetaRecordId = cloudMeta?.recordId;
  const cloudMetaKeyB64 = cloudMeta?.keyB64;
  useEffect(() => {
    if (!cloudMetaRecordId || !cloudMetaKeyB64) {
      // Identity-driven reset on cloudMeta clear; see useCloudMatrix.ts
      // for the same pattern.
      /* eslint-disable react-hooks/set-state-in-effect */
      setExistingHandle(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const key = await keyFromB64(cloudMetaKeyB64);
        if (cancelled) return;
        setExistingHandle({
          recordId: cloudMetaRecordId,
          key,
          schemaVersion: SCHEMA_VERSION,
        });
      } catch {
        if (cancelled) return;
        setExistingHandle(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloudMetaRecordId, cloudMetaKeyB64]);

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
      // Seed a fresh Y.Doc from the current snapshot, then encode it as
      // the baseline payload for the server.
      const doc = new Y.Doc();
      seedYDoc(doc, { title: matrixTitle, snapshot: snap });
      const baseline = Y.encodeStateAsUpdate(doc);
      const created = await repo.create({ baseline });
      setTempHandle(created.handle);
      onCloudMetaSet({
        recordId: created.handle.recordId,
        keyB64: await keyToB64(created.handle.key),
        lastHeadSeq: created.headSeq,
        yDocStateB64: encodeYDocStateForMeta(baseline),
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
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="primary"
            size="default"
            className="gap-2 px-3 text-[15px] sm:px-4"
            onClick={() => setOpen(true)}
            disabled={disabled}
            aria-label={busy ? "Sharing" : "Share"}
          >
            {busy ? (
              <Loader2 className="size-[18px] animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <UserPlus className="size-[18px]" aria-hidden />
            )}
            {/* Label collapses to icon-only below md as the final
                graceful step in the title-row narrowing sequence. */}
            <span className="hidden md:inline">
              {busy ? "Sharing…" : "Share"}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">End-to-end encrypted</TooltipContent>
      </Tooltip>
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
