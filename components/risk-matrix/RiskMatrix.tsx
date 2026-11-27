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
import CloudShareControl, {
  type CloudShareControlHandle,
} from "./CloudShareControl";
import MatrixStatusIndicator from "./MatrixStatusIndicator";
import { isCloudEnabled } from "./cloudConfig";
import MitigationsTablePlaceholder from "./MitigationsTablePlaceholder";
import DeleteRiskDialog from "./DeleteRiskDialog";
import DragPreviewLayer from "./DragPreviewLayer";
import { SuppressTooltips } from "@/components/ui/tooltip";
import KeyboardShortcutsDialog from "./KeyboardShortcutsDialog";
import LikelihoodImpactMatrix from "./LikelihoodImpactMatrix";
import MatrixExportMenu from "./MatrixExportMenu";
import MatrixTopBar from "./MatrixTopBar";
import NotesEditor from "./NotesEditor";
import RiskPoolSection from "./RiskPoolSection";
import SaveReminder from "./SaveReminder";
import ResourcesSection from "./ResourcesSection";
import StepSection from "./StepSection";
import GuidanceBrief from "./guidance/GuidanceBrief";
import {
  GuidanceProvider,
  useGuidance,
  useStepExample,
} from "./guidance/GuidanceContext";
import SafetyPlanningIntro from "./guidance/SafetyPlanningIntro";
import { PlanExampleArea } from "./guidance/examples";
import {
  EXAMPLE_CELLS,
  STEP_2,
  STEP_4,
  STEP_TITLES,
} from "./guidance/guidanceCopy";
import {
  MATRIX_READING_COLUMN_GRID_CHILD_CLASS,
  STEP_SECTION_ACTION_BUTTON_CLASS,
} from "./constants";
import {
  copyFullReport,
  copyMatrixRisks,
  copyMitigationsMarkdown,
  copyRichWorksheet,
  copyResources,
  copyRiskPool,
} from "./matrixClipboard";
import { canCopyMatrix, canCopyPool, canCopyResources } from "./matrixExport";
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
import {
  createFirstTimeTracker,
  trackEvent,
  type FirstTimeTracker,
} from "@/lib/analytics/events";
import { base64urlEncode, keyFromB64 } from "@/lib/e2ee";
import { createLogger } from "@/lib/log";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const log = createLogger("rmsync");

type CanvasProps = {
  workspace: MatrixWorkspaceApi;
  cloud: ReturnType<typeof useCloudMatrix>;
  /**
   * The canvas puts its remote-apply function here so the parent can
   * call it straight from the sync callback.
   */
  remoteApplyRef: React.MutableRefObject<RemoteApply | null>;
};

type RemoteApply = (doc: import("yjs").Doc) => void;

function RiskMatrixCanvas({ workspace: ws, cloud, remoteApplyRef }: CanvasProps) {
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
          resources: snap.resources ?? [],
          otherActions: snap.otherActions,
          hiddenCategorizedRiskKeys: snap.hiddenCategorizedRiskKeys,
          notes: snap.notes,
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

  // Pull remote edits into the live canvas state in place. This used to
  // remount the whole canvas, which destroyed the textarea the local user
  // was typing in on every keystroke from the other device. The doc
  // already holds every bridged local edit merged with the remote ones,
  // so its view is the state to show; the bridge then sees a snapshot
  // equal to the doc and emits no ops. Registered through a ref so the
  // state update lands in the same batch as the sync callback, leaving no
  // render in between where the canvas shows (and could bridge) stale
  // state.
  const { applyRemoteSnapshot } = m;
  useLayoutEffect(() => {
    remoteApplyRef.current = (doc) =>
      applyRemoteSnapshot(snapshotFromDoc(doc).snapshot);
    return () => {
      remoteApplyRef.current = null;
    };
  }, [remoteApplyRef, applyRemoteSnapshot]);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Per-canvas first-time-event tracker. Recreated when the canvas
  // remounts (matrix switch) so each fresh canvas seeds its own
  // `blocked` set; per-session dedupe is handled inside the module.
  const firstTimeTrackerRef = useRef<FirstTimeTracker | null>(null);
  if (firstTimeTrackerRef.current === null) {
    firstTimeTrackerRef.current = createFirstTimeTracker();
  }
  useEffect(() => {
    // The pre-hydrate render uses an EMPTY workspace until localStorage
    // loads in useMatrixWorkspace's layout effect. Skip until we have a
    // real surface so the seed isn't taken against a stub snapshot.
    if (ws.surfaceId === "pre-hydrate") return;
    firstTimeTrackerRef.current?.(m.getSnapshot());
    // The first-time flags are derived from pool/grid/notes only.
    // `m.getSnapshot` is a stable callback that re-observes each time
    // any of those change; the lint can't see across the property
    // access so we list the inputs directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.surfaceId, m.pool, m.grid, m.notes]);

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
  // Ignored with cloud sync off, so the pill never claims a share that this
  // build cannot reach. See activeCloudMeta in RiskMatrix below.
  const cloudMeta = isCloudEnabled() ? (activeSaved?.cloud ?? null) : null;
  // The Share button is always available when cloud is enabled. Drafts are
  // promoted to saved rows on demand (see handleCloudMetaSet below).
  const cloudCapable = isCloudEnabled();
  // The local explainer's Share button opens the top bar's own share
  // dialog, so the share flow survives the matrix becoming shared.
  const shareRef = useRef<CloudShareControlHandle>(null);

  const handleStopSharing = useCallback(async () => {
    if (!activeSaved?.cloud) return;
    const meta = activeSaved.cloud;
    try {
      await cloud.repo.delete({
        recordId: meta.recordId,
        key: await keyFromB64(meta.keyB64),
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
      resources: m.resources,
      allActions: m.allActions,
      otherActions: m.otherActions,
    }),
    [ws.activeTitle, m.pool, m.grid, m.resources, m.allActions, m.otherActions],
  );

  const handleCopyAll = useCallback(() => {
    trackEvent("copy_worksheet", { type: "plain" });
    void copyFullReport(copyArgs);
  }, [copyArgs]);

  const handleCopyRich = useCallback(() => {
    trackEvent("copy_worksheet", { type: "rich" });
    void copyRichWorksheet({ ...copyArgs, notes: m.notes });
  }, [copyArgs, m.notes]);

  const canRes = canCopyResources(m.resources);
  const hasAnyCopyableContent = canPool || canMx || canRes || canMit || canAct;

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
        handleCopyAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCopyAll]);

  // Each step's Copy is named for what it copies, matching its toast, so
  // a screen reader's list of buttons tells them apart. Below sm only the
  // icon shows, and the name still comes from the label.
  const stepCopyBtn = (opts: {
    label: string;
    disabled: boolean;
    onClick: () => void;
  }) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={opts.label}
      className={cn("gap-1 text-xs", STEP_SECTION_ACTION_BUTTON_CLASS)}
      disabled={opts.disabled}
      onClick={opts.onClick}
    >
      <Copy size={14} strokeWidth={2} aria-hidden />
      <span className="hidden sm:inline">Copy</span>
    </Button>
  );

  const step1Copy = stepCopyBtn({
    label: "Copy risk pool",
    disabled: !canPool,
    onClick: () => void copyRiskPool(m.pool),
  });

  const step2Copy = stepCopyBtn({
    label: "Copy matrix",
    disabled: !canMx,
    onClick: () => void copyMatrixRisks(m.grid),
  });

  const step3ResourcesCopy = stepCopyBtn({
    label: "Copy resources",
    disabled: !canRes,
    onClick: () => void copyResources(m.resources),
  });

  const step3Copy = stepCopyBtn({
    label: "Copy all mitigations",
    disabled: !canMit,
    onClick: () => void copyMitigationsMarkdown(m.grid),
  });

  const dragging = Boolean(m.dragState || m.mitigationDragState);

  // The plan's example stays until the first idea is written in it, rather
  // than going when the first risk lands on the matrix, so it is still
  // there when someone scrolls down to the plan.
  const anyIdea = useMemo(
    () =>
      Object.values(m.grid).some((lines) =>
        lines.some((l) =>
          [...(l.reduce ?? []), ...(l.prepare ?? [])].some(
            (s) => s.text.trim().length > 0,
          ),
        ),
      ),
    [m.grid],
  );
  const { enabled: guidance } = useGuidance();
  const matrixExample = useStepExample("matrix", !m.anyRisks);
  const planExample = useStepExample("plan", !anyIdea);
  const placedRiskCount = useMemo(
    () =>
      Object.values(m.grid).reduce(
        (n, lines) => n + lines.filter((l) => l.text.trim().length > 0).length,
        0,
      ),
    [m.grid],
  );

  return (
    <SuppressTooltips when={dragging}>
      <div
        className={[
          "mx-auto min-h-screen w-full max-w-[1320px] bg-rm-canvas px-4 py-5 font-sans text-rm-ink sm:px-6 sm:py-6 lg:px-8",
          dragging ? "touch-none rm-dragging-active" : "touch-auto",
        ].join(" ")}
        onPaste={m.handlePaste}
      >
        <MatrixTopBar
          workspace={ws}
          exportMenu={
            <MatrixExportMenu
              title={ws.activeTitle}
              getSnapshot={m.getSnapshot}
              hasContent={hasAnyCopyableContent}
              onCopyPlain={handleCopyAll}
              onCopyRich={handleCopyRich}
            />
          }
          statusIndicator={
            <MatrixStatusIndicator
              shared={Boolean(cloudMeta)}
              syncState={cloud.syncState}
              onIndicatorAction={cloud.reopenAction}
              exportMenu={
                <MatrixExportMenu
                  title={ws.activeTitle}
                  getSnapshot={m.getSnapshot}
                  hasContent={hasAnyCopyableContent}
                  onCopyPlain={handleCopyAll}
                  onCopyRich={handleCopyRich}
                  placement="callout"
                />
              }
              onShare={cloudCapable ? () => shareRef.current?.open() : undefined}
            />
          }
          cloudShareControl={
            cloudCapable ? (
              <CloudShareControl
                ref={shareRef}
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

        <SafetyPlanningIntro />

        <RiskPoolSection
          pool={m.pool}
          placedRiskCount={placedRiskCount}
          dragState={m.dragState}
          dragOverTarget={m.dragOverTarget}
          dropIndicator={m.dropIndicator}
          onAddRisks={m.addPoolRisks}
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
            title={STEP_TITLES[2]}
            guidance={
              <GuidanceBrief
                lead={STEP_2.lead}
                more={STEP_2.more}
                example={matrixExample}
                examplePlan
              />
            }
          >
            <LikelihoodImpactMatrix
              grid={m.grid}
              dragState={m.dragState}
              dragOverTarget={m.dragOverTarget}
              dropIndicator={m.dropIndicator}
              onAddCellLine={m.requestAddMatrixCellLine}
              onCellClick={m.onCellClick}
              onChange={m.updateText}
              onKeyDown={m.handleKeyDown}
              onBlur={m.handleLineBlur}
              onGripPointerDown={m.onGripPointerDown}
              stepSectionFrame
              exampleCells={matrixExample.shown ? EXAMPLE_CELLS : null}
            />
          </StepSection>
        </div>

        <ResourcesSection
          className="mt-9"
          resources={m.resources}
          onAdd={m.addResources}
          onChange={m.updateResource}
          onKeyDown={m.handleResourceKeyDown}
          onBlur={m.handleResourceBlur}
          actions={step3ResourcesCopy}
        />

        <div
          className={[
            "mt-9 grid w-full min-w-0 grid-cols-1 items-start gap-y-3",
            "xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] xl:gap-x-8 xl:gap-y-3",
          ].join(" ")}
        >
          {/* Mitigations + step 4 header: one card spanning both grid rows (xl) */}
          <div className="min-w-0 max-xl:mt-5 xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:mt-0">
            <StepSection
              step={4}
              readingWidth={false}
              allowOverflow
              className="w-full max-w-none"
              actions={step3Copy}
              title={STEP_TITLES[4]}
              guidance={
                <GuidanceBrief lead={STEP_4.lead} more={STEP_4.more} examplePlan />
              }
            >
              {m.anyRisks ? (
                <>
                  {/* Examples come before the person's own cards, as they do
                      above the list in steps 1 and 3 on phones. */}
                  {guidance ? (
                    <PlanExampleArea
                      example={planExample}
                      empty={!anyIdea}
                      nothingPlaced={false}
                    />
                  ) : null}
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
                    draggingSubId={m.draggingSubId}
                    mitigationDropEdge={m.mitigationDropEdge}
                    onMitigationGripPointerDown={m.onMitigationGripPointerDown}
                    embeddedInStepSection
                  />
                </>
              ) : guidance ? (
                <PlanExampleArea example={planExample} empty={!anyIdea} nothingPlaced />
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
            {/*
              xl+: ActionsAside and NotesEditor share a single sticky
              wrapper so they pin together as the page scrolls past the
              mitigations table on the left. ActionsAside used to sticky
              on its own (xl:sticky xl:top-6) — fine when it was the
              only thing in this column, but now Notes lives below it
              and would scroll up under the pinned Actions card.
              Below xl: stacks normally with no sticky behaviour.
            */}
            <div className="xl:sticky xl:top-6 xl:self-start">
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
              <SaveReminder
                className="mt-5"
                exportMenu={
                  <MatrixExportMenu
                    title={ws.activeTitle}
                    getSnapshot={m.getSnapshot}
                    hasContent={hasAnyCopyableContent}
                    onCopyPlain={handleCopyAll}
                    onCopyRich={handleCopyRich}
                    placement="callout"
                  />
                }
              />
              <NotesEditor
                className="mt-5"
                value={m.notes}
                onChange={m.setNotes}
              />
            </div>
          </div>
        </div>

        <DragPreviewLayer dragState={m.dragState} />
        <DragPreviewLayer dragState={m.mitigationDragState} />

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
    </SuppressTooltips>
  );
}

export default function RiskMatrix() {
  const repo = useMemo(() => createLocalMatrixRepository(), []);
  const ws = useMatrixWorkspace(repo);
  // With cloud sync off (the offline file, or a deploy without a database)
  // a row's share metadata is ignored, so nothing opens a connection or
  // rewrites the address bar. Such a row can only come from storage written
  // elsewhere: imported files never carry it.
  const activeCloudMeta = isCloudEnabled() ? (ws.activeSavedMatrix?.cloud ?? null) : null;
  // Set by the canvas. Remote changes are applied to its state in place;
  // they must NOT remount it (e.g. through its `key`), because remounting
  // on every remote keystroke steals focus from whoever is typing here.
  const remoteApplyRef = useRef<RemoteApply | null>(null);

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
          resources: view.snapshot.resources,
          otherActions: view.snapshot.otherActions,
          hiddenCategorizedRiskKeys: view.snapshot.hiddenCategorizedRiskKeys,
          notes: view.snapshot.notes,
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
        // wrote row.snapshot atomically; here we only need the canvas
        // to pull the doc's view into its state.
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
        log.info("onChange apply remote", {
          recordId,
          rowPoolCount: row.snapshot.pool.length,
          docPoolCount: view.snapshot.pool.length,
          titleChanged: !sameTitle,
        });
        remoteApplyRef.current?.(doc);
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
  // The last shared matrix this tab had open. A share link for it in the
  // address bar is one we wrote, not an inbound link still being imported.
  const lastActiveRecordIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    // No share links without cloud sync. In the offline file this would
    // also throw: a file: URL's path cannot be rewritten.
    if (!cloudEnabled) return;
    if (importer.state.kind === "loading" || importer.state.kind === "ready") {
      // The share-import flow owns the URL while it's resolving.
      return;
    }
    if (activeRecordId) lastActiveRecordIdRef.current = activeRecordId;
    let cancelled = false;
    void (async () => {
      const inboundShare = await parseShareLocation({
        pathname: window.location.pathname,
        hash: window.location.hash,
      });
      if (cancelled) return;
      if (
        inboundShare &&
        inboundShare.recordId !== lastActiveRecordIdRef.current
      ) {
        // Keep `/grid/<id>#<key>` stable during initial mount/adoption so
        // we don't flash to `/` before the importer finishes. Once that
        // matrix has been open, its link is ours, and leaving it for an
        // unshared one (Open recent, Duplicate) must clear it.
        return;
      }
      if (activeRecordId && activeKeyB64) {
        const key = await keyFromB64(activeKeyB64);
        if (cancelled) return;
        await setShareUrlInAddressBar({
          recordId: activeRecordId,
          key,
        });
      } else if (window.location.pathname.startsWith("/grid/")) {
        clearShareFromUrl();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeRecordId, activeKeyB64, importer.state.kind, cloudEnabled]);

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
    <GuidanceProvider>
      <RiskMatrixCanvas
        key={ws.surfaceId}
        workspace={ws}
        cloud={cloud}
        remoteApplyRef={remoteApplyRef}
      />
    </GuidanceProvider>
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
