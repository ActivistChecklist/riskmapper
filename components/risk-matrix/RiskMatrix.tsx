"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Copy } from "lucide-react";
import ActionsAside from "./ActionsAside";
import CategorizedRiskGroups from "./CategorizedRiskGroups";
import CloudShareControl from "./CloudShareControl";
import MatrixStatusIndicator from "./MatrixStatusIndicator";
import { isCloudEnabled } from "./cloudConfig";
import MitigationsTablePlaceholder from "./MitigationsTablePlaceholder";
import DeleteRiskDialog from "./DeleteRiskDialog";
import DragPreviewLayer from "./DragPreviewLayer";
import KeyboardShortcutsDialog from "./KeyboardShortcutsDialog";
import LikelihoodImpactMatrix from "./LikelihoodImpactMatrix";
import MatrixCopyDropdown from "./MatrixCopyDropdown";
import MatrixHelpSection from "./MatrixHelpSection";
import MatrixTopBar from "./MatrixTopBar";
import RiskPoolSection from "./RiskPoolSection";
import StepSection from "./StepSection";
import {
  MATRIX_READING_COLUMN_GRID_CHILD_CLASS,
  STEP_SECTION_ACTION_BUTTON_CLASS,
} from "./constants";
import {
  copyFullReport,
  copyMatrixRisks,
  copyMitigationsMarkdown,
  copyRiskPool,
  copyStarredActions,
  copySummary,
} from "./matrixClipboard";
import { canCopyMatrix, canCopyPool } from "./matrixExport";
import { createLocalMatrixRepository } from "./matrixDataLayer";
import { hasMitigationsMarkdownExport } from "./mitigationsMarkdown";
import { useRiskMatrix } from "./useRiskMatrix";
import { useMatrixWorkspace } from "./useMatrixWorkspace";
import type { MatrixWorkspaceApi } from "./useMatrixWorkspace";
import { useCloudMatrix } from "./useCloudMatrix";
import { useShareImport } from "./useShareImport";
import { applySnapshotDiff, snapshotFromDoc } from "./snapshotDiff";
import {
  clearShareFromUrl,
  parseShareLocation,
  setShareUrlInAddressBar,
} from "./shareUrl";
import { sharedSnapshotFieldsEqual } from "./snapshotEquality";
import { base64urlEncode, keyFromB64 } from "@/lib/e2ee";
import { createLogger } from "@/lib/log";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const log = createLogger("rmsync");

type CanvasProps = {
  workspace: MatrixWorkspaceApi;
  cloud: ReturnType<typeof useCloudMatrix>;
};

function RiskMatrixCanvas({ workspace: ws, cloud }: CanvasProps) {
  // Snapshot bridge: when there's an active Y.Doc, every local snapshot
  // change diffs into the doc. The doc's `update` event then routes the
  // diff through the cloud append outbox (see useCloudMatrix).
  const lastBridgedRef = useRef<{
    title: string;
    snapshot: ReturnType<typeof snapshotFromDoc>["snapshot"];
  } | null>(null);

  const onSnapshotChange = useCallback(
    (snap: import("./matrixTypes").RiskMatrixSnapshot) => {
      ws.onSnapshotChange(snap);
      const doc = cloud.doc;
      if (!doc) return;
      const seededFromDoc = lastBridgedRef.current === null;
      if (seededFromDoc) {
        lastBridgedRef.current = snapshotFromDoc(doc);
      }
      const prev = lastBridgedRef.current;
      const next = {
        title: ws.activeTitle,
        snapshot: {
          pool: snap.pool,
          grid: snap.grid,
          otherActions: snap.otherActions,
          hiddenCategorizedRiskKeys: snap.hiddenCategorizedRiskKeys,
        },
      };
      const prevPoolCount = prev?.snapshot.pool.length ?? 0;
      const nextPoolCount = next.snapshot.pool.length;
      const docRiskCount = (doc.getMap("matrix").get("risks") as
        | import("yjs").Map<unknown>
        | undefined)?.size ?? 0;
      log.info("bridge invoke", {
        seededFromDoc,
        prevPool: prevPoolCount,
        nextPool: nextPoolCount,
        docRiskCount,
      });
      applySnapshotDiff(doc, lastBridgedRef.current, next);
      lastBridgedRef.current = next;
    },
    [cloud.doc, ws],
  );

  const m = useRiskMatrix({
    initialSnapshot: ws.initialSnapshot,
    onSnapshotChange,
  });
  const { matrixGetterRef } = ws;
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useLayoutEffect(() => {
    matrixGetterRef.current = m.getSnapshot;
  }, [m.getSnapshot, matrixGetterRef]);

  // Seed the bridge baseline from the doc whenever the doc identity changes
  // (active matrix switched, or first attach to this matrix).
  useEffect(() => {
    if (!cloud.doc) {
      lastBridgedRef.current = null;
      return;
    }
    lastBridgedRef.current = snapshotFromDoc(cloud.doc);
  }, [cloud.doc]);

  // Title diff: separate from the snapshot pipeline because title lives on
  // the workspace, not on the snapshot.
  useEffect(() => {
    const doc = cloud.doc;
    if (!doc) return;
    const baseline = lastBridgedRef.current;
    if (!baseline) return;
    if (baseline.title === ws.activeTitle) return;
    applySnapshotDiff(doc, baseline, { ...baseline, title: ws.activeTitle });
    lastBridgedRef.current = { ...baseline, title: ws.activeTitle };
  }, [cloud.doc, ws.activeTitle]);

  const activeSaved = ws.activeSavedMatrix;
  const cloudMeta = activeSaved?.cloud ?? null;
  // The Share button is always available when cloud is enabled. Drafts are
  // promoted to saved rows on demand (see handleCloudMetaSet below).
  const cloudCapable = isCloudEnabled();

  const handleStopSharing = useCallback(async () => {
    if (!activeSaved?.cloud) return;
    const meta = activeSaved.cloud;
    try {
      await cloud.repo.delete({
        recordId: meta.recordId,
        key: keyFromB64(meta.keyB64),
        schemaVersion: 2,
      });
    } finally {
      cloud.cancel();
      ws.setCloudMeta(activeSaved.id, null);
    }
  }, [activeSaved, cloud, ws]);

  const canMit = useMemo(
    () => hasMitigationsMarkdownExport(m.grid),
    [m.grid],
  );
  const canPool = useMemo(() => canCopyPool(m.pool), [m.pool]);
  const canMx = useMemo(() => canCopyMatrix(m.grid), [m.grid]);
  const canAct = useMemo(() => {
    const starredOk = m.allActions.some(
      (a) => a.subLine.text.trim().length > 0,
    );
    const otherOk = m.otherActions.some((o) => o.text.trim().length > 0);
    return starredOk || otherOk;
  }, [m.allActions, m.otherActions]);

  const copyArgs = useMemo(
    () => ({
      title: ws.activeTitle,
      pool: m.pool,
      grid: m.grid,
      allActions: m.allActions,
      otherActions: m.otherActions,
    }),
    [ws.activeTitle, m.pool, m.grid, m.allActions, m.otherActions],
  );

  const handleCopyFull = useCallback(() => {
    void copyFullReport(copyArgs);
  }, [copyArgs]);

  const handleCopySummary = useCallback(() => {
    void copySummary(copyArgs);
  }, [copyArgs]);

  const handleCopyPool = useCallback(() => {
    void copyRiskPool(m.pool);
  }, [m.pool]);

  const handleCopyMatrix = useCallback(() => {
    void copyMatrixRisks(m.grid);
  }, [m.grid]);

  const handleCopyMitigations = useCallback(() => {
    void copyMitigationsMarkdown(m.grid);
  }, [m.grid]);

  const handleCopyActionsOnly = useCallback(() => {
    void copyStarredActions(m.allActions, m.otherActions);
  }, [m.allActions, m.otherActions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "/" || e.code === "Slash") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (e.shiftKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        void copyFullReport({
          title: ws.activeTitle,
          pool: m.pool,
          grid: m.grid,
          allActions: m.allActions,
          otherActions: m.otherActions,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ws.activeTitle, m.pool, m.grid, m.allActions, m.otherActions]);

  const stepCopyBtn = (opts: {
    disabled: boolean;
    onClick: () => void;
  }) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("gap-1 text-xs", STEP_SECTION_ACTION_BUTTON_CLASS)}
      disabled={opts.disabled}
      onClick={opts.onClick}
    >
      <Copy size={14} strokeWidth={2} aria-hidden />
      <span className="hidden sm:inline">Copy</span>
    </Button>
  );

  const step1Copy = stepCopyBtn({
    disabled: !canPool,
    onClick: () => void copyRiskPool(m.pool),
  });

  const step2Copy = stepCopyBtn({
    disabled: !canMx,
    onClick: () => void copyMatrixRisks(m.grid),
  });

  const step3Copy = stepCopyBtn({
    disabled: !canMit,
    onClick: () => void copyMitigationsMarkdown(m.grid),
  });

  return (
    <div
      className={[
        "mx-auto min-h-screen w-full max-w-[1320px] bg-rm-canvas px-4 py-5 font-sans text-rm-ink sm:px-6 sm:py-6 lg:px-8",
        m.dragState ? "touch-none rm-dragging-active" : "touch-auto",
      ].join(" ")}
    >
      <MatrixTopBar
        workspace={ws}
        copyMenu={({ iconOnly }) => (
          <MatrixCopyDropdown
            iconOnly={iconOnly}
            toolbar
            canCopyPool={canPool}
            canCopyMatrix={canMx}
            canCopyMitigations={canMit}
            canCopyActions={canAct}
            onCopyFull={handleCopyFull}
            onCopySummary={handleCopySummary}
            onCopyPool={handleCopyPool}
            onCopyMatrix={handleCopyMatrix}
            onCopyMitigations={handleCopyMitigations}
            onCopyActions={handleCopyActionsOnly}
          />
        )}
        statusIndicator={
          <MatrixStatusIndicator
            shared={Boolean(cloudMeta)}
            syncState={cloud.syncState}
            onIndicatorAction={cloud.reopenAction}
          />
        }
        cloudShareControl={
          cloudCapable ? (
            <CloudShareControl
              getSnapshot={m.getSnapshot}
              matrixTitle={ws.activeTitle}
              cloudMeta={cloudMeta}
              repo={cloud.repo}
              onCloudMetaSet={(meta) => {
                // If we're on a draft when the user shares, promote it to a
                // saved row first so there's something to attach the cloud
                // meta to. Promotion uses the current draft title (defaults
                // to "Untitled" if the user hasn't edited it).
                let savedId = activeSaved?.id;
                if (!savedId) {
                  const newId = ws.promoteDraftToSaved(ws.activeTitle);
                  if (!newId) return;
                  savedId = newId;
                }
                ws.setCloudMeta(savedId, meta);
              }}
              onStopSharing={handleStopSharing}
              onAcknowledge={cloud.acknowledge}
            />
          ) : null
        }
      />

      <MatrixHelpSection />

      <RiskPoolSection
        pool={m.pool}
        dragState={m.dragState}
        dragOverTarget={m.dragOverTarget}
        onPoolClick={m.onPoolClick}
        onAddPoolLine={m.requestAddPoolLine}
        onChange={m.updateText}
        onKeyDown={m.handleKeyDown}
        onBlur={m.handleLineBlur}
        onGripPointerDown={m.onGripPointerDown}
        step1Actions={step1Copy}
      />

      <div className="-mx-4 mt-2 min-w-0 w-[calc(100%+2rem)] sm:mx-0 sm:mt-3 sm:w-full">
        <StepSection
          step={2}
          readingWidth={false}
          className="w-full max-w-none"
          actions={step2Copy}
          title="Drag the risks into the matrix"
        >
          <LikelihoodImpactMatrix
            grid={m.grid}
            dragState={m.dragState}
            dragOverTarget={m.dragOverTarget}
            onAddCellLine={m.requestAddMatrixCellLine}
            onCellClick={m.onCellClick}
            onChange={m.updateText}
            onKeyDown={m.handleKeyDown}
            onBlur={m.handleLineBlur}
            onGripPointerDown={m.onGripPointerDown}
            stepSectionFrame
          />
        </StepSection>
      </div>

      <div
        className={[
          "mt-9 grid w-full min-w-0 grid-cols-1 items-start gap-y-3",
          "xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] xl:gap-x-8 xl:gap-y-3",
        ].join(" ")}
      >
        {/* Mitigations + step 3 header: one card spanning both grid rows (xl) */}
        <div className="min-w-0 max-xl:mt-5 xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:mt-0">
          <StepSection
            step={3}
            readingWidth={false}
            allowOverflow
            className="w-full max-w-none"
            actions={step3Copy}
            title="Brainstorm ways you can prepare for these risks. Star the items you intend to act on."
          >
            {m.anyRisks ? (
              <CategorizedRiskGroups
                anyRisks={m.anyRisks}
                risksByColor={m.risksByColor}
                collapsed={m.collapsed}
                setCollapsed={m.setCollapsed}
                hiddenCategorizedRiskKeys={m.hiddenCategorizedRiskKeys}
                categorizedRevealHidden={m.categorizedRevealHidden}
                onToggleCategorizedRiskHidden={m.toggleCategorizedRiskHidden}
                onToggleCategorizedRevealHidden={m.toggleCategorizedRevealHidden}
                onChangeRisk={m.updateText}
                onRiskKeyDown={m.handleRiskKeyDown}
                onChangeSub={m.updateSubText}
                onSubKeyDown={m.handleSubKeyDown}
                onToggleStar={m.toggleStar}
                onPointerAddMitigationSubLine={m.requestAddMitigationSubLine}
                embeddedInStepSection
              />
            ) : (
              <MitigationsTablePlaceholder embeddedInStepSection />
            )}
          </StepSection>
        </div>
        {/* Actions sits at top of right column at xl+; on small screens it
            continues to stack below mitigations with the existing top margin. */}
        <div
          className={[
            MATRIX_READING_COLUMN_GRID_CHILD_CLASS,
            "min-w-0 max-xl:mt-5 xl:col-start-2 xl:row-start-1 xl:mt-0",
          ].join(" ")}
        >
          <ActionsAside
            allActions={m.allActions}
            otherActions={m.otherActions}
            onChangeSub={m.updateSubText}
            onToggleStar={m.toggleStar}
            onChangeOther={m.updateOtherAction}
            onAddOther={m.addOtherAction}
            onOtherKeyDown={m.handleOtherKeyDown}
            onOtherBlur={m.handleOtherBlur}
          />
        </div>
      </div>

      <DragPreviewLayer dragState={m.dragState} />

      <DeleteRiskDialog
        open={m.isDeleteConfirmOpen}
        onOpenChange={m.deleteDialogOnOpenChange}
        onCancel={m.closeDeleteConfirmation}
        onConfirm={m.confirmDelete}
      />

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
    </div>
  );
}

export default function RiskMatrix() {
  const repo = useMemo(() => createLocalMatrixRepository(), []);
  const ws = useMatrixWorkspace(repo);
  const activeCloudMeta = ws.activeSavedMatrix?.cloud ?? null;
  // Bumped each time a remote-driven snapshot is pushed back into
  // localStorage; appended to the canvas `key` so useRiskMatrix re-mounts
  // and re-reads its initial snapshot from the freshly-merged doc state.
  // Drag state during a remote update is sacrificed; in practice this is
  // rare (drags are sub-second) and far less bad than a stale view.
  const [remoteRev, setRemoteRev] = useState(0);

  const cloudCallbacks = useMemo(
    () => ({
      onMetaUpdate: (
        recordId: string,
        meta: import("./matrixTypes").CloudMatrixMeta,
        doc: import("yjs").Doc,
      ) => {
        const row = ws.workspace.saved.find((s) => s.cloud?.recordId === recordId);
        if (!row) return;
        // ATOMIC sync write: cloud meta + doc-derived snapshot in one
        // setWorkspace + repo.save. This is the ONLY path that updates
        // a cloud-backed row.snapshot in localStorage; the local
        // schedulePersist debounce intentionally skips cloud-backed
        // matrices (see mergeSnapshotIntoWorkspace) to avoid two-tab
        // races on shared localStorage.
        const view = snapshotFromDoc(doc);
        const merged: import("./matrixTypes").RiskMatrixSnapshot = {
          ...row.snapshot,
          pool: view.snapshot.pool,
          grid: view.snapshot.grid,
          otherActions: view.snapshot.otherActions,
          hiddenCategorizedRiskKeys: view.snapshot.hiddenCategorizedRiskKeys,
        };
        ws.applyCloudSync(row.id, {
          cloud: meta,
          snapshot: merged,
          title: view.title,
        });
      },
      onChange: (doc: import("yjs").Doc) => {
        // Fired on remote-driven updates (non-self SSE events and
        // catch-up that advanced the doc state). onMetaUpdate already
        // wrote row.snapshot atomically; here we only need to bump
        // remoteRev so the canvas re-mounts and useRiskMatrix re-reads
        // its initialSnapshot from the freshly-written ws state.
        const recordId = ws.activeSavedMatrix?.cloud?.recordId;
        if (!recordId) return;
        const row = ws.workspace.saved.find((s) => s.cloud?.recordId === recordId);
        if (!row) return;
        const view = snapshotFromDoc(doc);
        const sameTitle = row.title === view.title;
        const sameSnapshot = sharedSnapshotFieldsEqual(row.snapshot, view.snapshot);
        if (sameTitle && sameSnapshot) {
          log.info("onChange skip (no-op)", { recordId });
          return;
        }
        log.info("onChange remount", {
          recordId,
          rowPoolCount: row.snapshot.pool.length,
          docPoolCount: view.snapshot.pool.length,
          titleChanged: !sameTitle,
        });
        setRemoteRev((r) => r + 1);
      },
    }),
    [ws],
  );
  const cloud = useCloudMatrix(activeCloudMeta, cloudCallbacks);
  const cloudEnabled = isCloudEnabled();
  const importer = useShareImport({ repo: cloud.repo, enabled: cloudEnabled });
  const adoptedRef = useRef(false);

  // Address bar mirrors the active matrix's share state. When a matrix is
  // shared and active, the URL becomes the canonical share link the user
  // can paste from the address bar. When the active matrix is unshared
  // (no cloud meta or no key persisted), strip the share path so the user
  // can't accidentally share an unshared matrix.
  const activeRecordId = ws.activeSavedMatrix?.cloud?.recordId;
  const activeKeyB64 = ws.activeSavedMatrix?.cloud?.keyB64;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const inboundShare = parseShareLocation({
      pathname: window.location.pathname,
      hash: window.location.hash,
    });
    if (importer.state.kind === "loading" || importer.state.kind === "ready") {
      // The share-import flow owns the URL while it's resolving.
      return;
    }
    if (inboundShare) {
      // Keep `/grid/<id>#<key>` stable during initial mount/adoption so we
      // don't flash to `/` before the importer finishes.
      return;
    }
    if (activeRecordId && activeKeyB64) {
      setShareUrlInAddressBar({
        recordId: activeRecordId,
        key: keyFromB64(activeKeyB64),
      });
    } else if (window.location.pathname.startsWith("/grid/")) {
      clearShareFromUrl();
    }
  }, [activeRecordId, activeKeyB64, importer.state.kind]);

  // Auto-adopt: when the share fetch resolves, drop the matrix straight into
  // the local library and switch to it. If the recordId is already in the
  // library (a previous import or the original sharer's own copy) we just
  // open that row instead of creating a duplicate.
  useEffect(() => {
    if (importer.state.kind !== "ready") return;
    if (adoptedRef.current) return;
    adoptedRef.current = true;
    const { result, handle, keyB64 } = importer.state;
    const existing = ws.workspace.saved.find(
      (s) => s.cloud?.recordId === handle.recordId,
    );
    console.info("[cloud] auto-adopt", {
      recordId: handle.recordId,
      remoteHeadSeq: result.headSeq,
      branch: existing ? "open-existing" : "new-row",
      existingLastHeadSeq: existing?.cloud?.lastHeadSeq ?? null,
    });
    if (existing) {
      ws.openSaved(existing.id);
    } else {
      ws.adoptSharedMatrix({
        title: result.title,
        snapshot: result.snapshot,
        cloud: {
          recordId: handle.recordId,
          keyB64,
          lastHeadSeq: result.headSeq,
          yDocStateB64: base64urlEncode(result.yDocState),
        },
      });
    }
    importer.reset();
  }, [importer, ws]);

  if (importer.state.kind === "loading" || importer.state.kind === "ready") {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-rm-ink/70">
        Loading shared matrix…
      </div>
    );
  }
  if (
    importer.state.kind === "missing" ||
    importer.state.kind === "error"
  ) {
    return (
      <ShareImportFailure state={importer.state} onDismiss={importer.dismiss} />
    );
  }
  return (
    <RiskMatrixCanvas
      key={`${ws.surfaceId}-${remoteRev}`}
      workspace={ws}
      cloud={cloud}
    />
  );
}

function ShareImportFailure({
  state,
  onDismiss,
}: {
  state: { kind: "missing" } | { kind: "error"; message: string };
  onDismiss: () => void;
}) {
  const heading =
    state.kind === "missing"
      ? "This shared matrix is no longer available"
      : "Couldn't open shared matrix";
  const detail =
    state.kind === "missing"
      ? "The link may have expired (90 days of inactivity) or the owner stopped sharing."
      : state.message;
  return (
    <div className="mx-auto mt-12 max-w-md px-4 text-center">
      <h2 className="text-lg font-semibold text-rm-ink">{heading}</h2>
      <p className="mt-2 text-sm text-rm-ink/80">{detail}</p>
      <Button className="mt-4" type="button" onClick={onDismiss}>
        Continue without it
      </Button>
    </div>
  );
}
