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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CanvasProps = {
  workspace: MatrixWorkspaceApi;
};

function RiskMatrixCanvas({ workspace: ws }: CanvasProps) {
  const m = useRiskMatrix({
    initialSnapshot: ws.initialSnapshot,
    onSnapshotChange: ws.onSnapshotChange,
  });
  const { matrixGetterRef } = ws;
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useLayoutEffect(() => {
    matrixGetterRef.current = m.getSnapshot;
  }, [m.getSnapshot, matrixGetterRef]);

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
  const ws = useMatrixWorkspace(repo);
  return <RiskMatrixCanvas key={ws.surfaceId} workspace={ws} />;
}
