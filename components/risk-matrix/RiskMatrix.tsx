"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { Copy } from "lucide-react";
import ActionsAside from "./ActionsAside";
import CategorizedRiskGroups from "./CategorizedRiskGroups";
import CloudConflictDialog from "./CloudConflictDialog";
import CloudShareControl from "./CloudShareControl";
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
import SharedMatrixSandboxBanner from "./SharedMatrixSandboxBanner";
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
import { useCloudSyncManager } from "./useCloudSyncManager";
import { useShareImport } from "./useShareImport";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { keyFromB64 } from "@/lib/e2ee";

type CanvasProps = {
  workspace: MatrixWorkspaceApi;
  cloud: ReturnType<typeof useCloudSyncManager>;
};

function RiskMatrixCanvas({ workspace: ws, cloud }: CanvasProps) {
  const m = useRiskMatrix({
    initialSnapshot: ws.initialSnapshot,
    onSnapshotChange: ws.onSnapshotChange,
  });
  const { matrixGetterRef } = ws;
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useLayoutEffect(() => {
    matrixGetterRef.current = m.getSnapshot;
  }, [m.getSnapshot, matrixGetterRef]);

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
        schemaVersion: 1,
      });
    } finally {
      cloud.cancel();
      ws.setCloudMeta(activeSaved.id, null);
    }
  }, [activeSaved, cloud, ws]);

  const handleConflictReload = useCallback(() => {
    // Flush any debounced local snapshot before reloading so no unsaved edits
    // are lost. The reload re-hydrates from local storage and pulls remote
    // state via the share import flow.
    ws.flushSave();
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, [ws]);

  const handleConflictKeepMine = useCallback(() => {
    if (!cloud.pendingConflict) return;
    const c = cloud.pendingConflict.conflict;
    cloud.resolveConflict({
      expectedVersion: c.remoteVersion,
      lamport: c.remoteLamport + 1,
    });
  }, [cloud]);

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
        cloudShareControl={
          cloudCapable ? (
            <CloudShareControl
              getSnapshot={m.getSnapshot}
              matrixTitle={ws.activeTitle}
              cloudMeta={cloudMeta}
              syncState={cloud.syncState}
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
              onIndicatorAction={cloud.reopenConflict}
            />
          ) : null
        }
      />

      <CloudConflictDialog
        open={cloud.pendingConflict !== null}
        onOpenChange={(o) => {
          if (!o) cloud.acknowledge();
        }}
        matrixTitle={ws.activeTitle}
        onReloadRemote={handleConflictReload}
        onKeepMine={handleConflictKeepMine}
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
          title="Drag the risks from the pool into the matrix when you are ready to categorize them."
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
            className="w-full max-w-none"
            actions={step3Copy}
            title="Brainstorm ways you can mitigate and prepare for these risks. Star an item you intend to act on."
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
        {/* Row 1 col 2: invisible cell shares row 1 height so Actions starts with the table */}
        <div
          className="hidden min-h-0 xl:col-start-2 xl:row-start-1 xl:block"
          aria-hidden
        />
        {/* Row 2 col 2: Actions — max-xl:mt-5 adds to gap-y-3 so stack matches previous gap-8 */}
        <div
          className={[
            MATRIX_READING_COLUMN_GRID_CHILD_CLASS,
            "min-w-0 max-xl:mt-5 xl:col-start-2 xl:row-start-2 xl:mt-0",
          ].join(" ")}
        >
          <ActionsAside
            allActions={m.allActions}
            otherActions={m.otherActions}
            onChangeSub={m.updateSubText}
            onToggleStar={m.toggleStar}
            onChangeOther={m.updateOtherAction}
            onRemoveOther={m.removeOtherAction}
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
  const cloud = useCloudSyncManager();
  const onCloudWrite = useMemo(() => cloud.enqueueWrite, [cloud.enqueueWrite]);
  const ws = useMatrixWorkspace(repo, { onCloudWrite });
  const cloudEnabled = isCloudEnabled();
  const importer = useShareImport({ repo: cloud.repo, enabled: cloudEnabled });

  if (importer.state.kind === "loading") {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-rm-ink/70">
        Loading shared matrix…
      </div>
    );
  }
  if (
    importer.state.kind === "missing" ||
    importer.state.kind === "rollback" ||
    importer.state.kind === "error"
  ) {
    return (
      <ShareImportFailure state={importer.state} onDismiss={importer.dismiss} />
    );
  }
  if (importer.state.kind === "ready") {
    const importState = importer.state;
    return (
      <SharedMatrixPreview
        importState={importState}
        onDismiss={importer.dismiss}
        onAdoptToLibrary={() => {
          ws.adoptSharedMatrix({
            title: importState.result.title,
            snapshot: importState.result.snapshot,
            cloud: {
              recordId: importState.handle.recordId,
              keyB64: importState.keyB64,
              lastSyncedVersion: importState.result.version,
              lastSyncedLamport: importState.result.lamport,
            },
          });
          importer.dismiss();
        }}
      />
    );
  }
  return <RiskMatrixCanvas key={ws.surfaceId} workspace={ws} cloud={cloud} />;
}

function ShareImportFailure({
  state,
  onDismiss,
}: {
  state:
    | { kind: "missing" }
    | { kind: "rollback"; message: string }
    | { kind: "error"; message: string };
  onDismiss: () => void;
}) {
  const heading =
    state.kind === "missing"
      ? "This shared matrix is no longer available"
      : state.kind === "rollback"
        ? "This shared matrix may be older than what you saw before"
        : "Couldn't open shared matrix";
  const detail =
    state.kind === "missing"
      ? "The link may have expired (90 days of inactivity) or the owner stopped sharing."
      : state.kind === "rollback"
        ? "To protect your data, the version on the server hasn't been loaded — it appears older than a copy you previously opened. If you believe this is correct (for example, after a server restore), contact the person who shared the link."
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

function SharedMatrixPreview({
  importState,
  onDismiss,
  onAdoptToLibrary,
}: {
  importState: Extract<
    ReturnType<typeof useShareImport>["state"],
    { kind: "ready" }
  >;
  onDismiss: () => void;
  onAdoptToLibrary: () => void;
}) {
  const { result, fingerprint } = importState;
  return (
    <div className="mx-auto min-h-screen w-full max-w-[1320px] bg-rm-canvas px-4 py-5 sm:px-6 lg:px-8">
      <SharedMatrixSandboxBanner
        matrixTitle={result.title}
        fingerprint={fingerprint}
        onSaveLocally={onAdoptToLibrary}
        onDismiss={onDismiss}
      />
      <div className="rounded-lg border border-black/10 bg-white p-4 text-sm text-rm-ink">
        <p className="text-base font-semibold">{result.title || "Untitled"}</p>
        <p className="mt-1 text-rm-ink/70">
          Read-only preview of a shared matrix. Click &ldquo;Save on this
          device&rdquo; in the banner above to add it to your library and edit
          it.
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-y-1 text-xs text-rm-ink/70 sm:grid-cols-2">
          <dt className="font-medium">Risks in pool</dt>
          <dd>{result.snapshot.pool.length}</dd>
          <dt className="font-medium">Cells with risks</dt>
          <dd>
            {Object.values(result.snapshot.grid).reduce(
              (n, lines) => n + lines.length,
              0,
            )}
          </dd>
          <dt className="font-medium">Other actions</dt>
          <dd>{result.snapshot.otherActions.length}</dd>
        </dl>
      </div>
    </div>
  );
}
