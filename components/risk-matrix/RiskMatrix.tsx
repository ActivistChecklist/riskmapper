"use client";

import React, { useLayoutEffect, useMemo } from "react";
import ActionsAside from "./ActionsAside";
import CategorizedRiskGroups from "./CategorizedRiskGroups";
import MitigationsTablePlaceholder from "./MitigationsTablePlaceholder";
import DeleteRiskDialog from "./DeleteRiskDialog";
import DragPreviewLayer from "./DragPreviewLayer";
import LikelihoodImpactMatrix from "./LikelihoodImpactMatrix";
import MatrixTopBar from "./MatrixTopBar";
import MitigationsStep3Prompt from "./MitigationsStep3Prompt";
import RiskPoolSection from "./RiskPoolSection";
import { createLocalMatrixRepository } from "./matrixDataLayer";
import { useRiskMatrix } from "./useRiskMatrix";
import { useMatrixWorkspace } from "./useMatrixWorkspace";
import type { MatrixWorkspaceApi } from "./useMatrixWorkspace";

type CanvasProps = {
  workspace: MatrixWorkspaceApi;
};

function RiskMatrixCanvas({ workspace: ws }: CanvasProps) {
  const m = useRiskMatrix({
    initialSnapshot: ws.initialSnapshot,
    onSnapshotChange: ws.onSnapshotChange,
  });
  const { matrixGetterRef } = ws;
  useLayoutEffect(() => {
    matrixGetterRef.current = m.getSnapshot;
  }, [m.getSnapshot, matrixGetterRef]);

  return (
    <div
      className={[
        "mx-auto min-h-screen w-full max-w-[1320px] bg-rm-canvas px-4 py-5 font-sans text-rm-ink sm:px-6 sm:py-6 lg:px-8",
        m.dragState ? "touch-none rm-dragging-active" : "touch-auto",
      ].join(" ")}
    >
      <MatrixTopBar workspace={ws} />

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
      />

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
      />

      <div className="mt-9 w-full min-w-0">
        <div className="w-full min-w-0">
          <MitigationsStep3Prompt />
        </div>
        <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] xl:items-start">
          <div className="min-w-0">
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
              />
            ) : (
              <MitigationsTablePlaceholder />
            )}
          </div>
          <ActionsAside
            grid={m.grid}
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
    </div>
  );
}

export default function RiskMatrix() {
  const repo = useMemo(() => createLocalMatrixRepository(), []);
  const ws = useMatrixWorkspace(repo);
  return <RiskMatrixCanvas key={ws.surfaceId} workspace={ws} />;
}
