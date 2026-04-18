"use client";

import React from "react";
import ActionsAside from "./ActionsAside";
import CategorizedRiskGroups from "./CategorizedRiskGroups";
import MitigationsTablePlaceholder from "./MitigationsTablePlaceholder";
import DeleteRiskDialog from "./DeleteRiskDialog";
import DragPreviewLayer from "./DragPreviewLayer";
import LikelihoodImpactMatrix from "./LikelihoodImpactMatrix";
import MatrixHelpToolbar from "./MatrixHelpToolbar";
import RiskPoolSection from "./RiskPoolSection";
import { useRiskMatrix } from "./useRiskMatrix";

export default function RiskMatrix() {
  const m = useRiskMatrix();

  return (
    <div
      className={[
        "mx-auto min-h-screen w-full max-w-[1320px] bg-rm-canvas px-4 py-5 font-sans text-rm-ink sm:px-6 sm:py-6 lg:px-8",
        m.dragState ? "touch-none" : "touch-auto",
      ].join(" ")}
    >
      <MatrixHelpToolbar />

      <RiskPoolSection
        pool={m.pool}
        dragState={m.dragState}
        dragOverTarget={m.dragOverTarget}
        hasCompletedFirstDragToMatrix={m.hasCompletedFirstDragToMatrix}
        onPoolClick={m.onPoolClick}
        onChange={m.updateText}
        onKeyDown={m.handleKeyDown}
        onBlur={m.handleLineBlur}
        onGripPointerDown={m.onGripPointerDown}
      />

      <LikelihoodImpactMatrix
        grid={m.grid}
        dragState={m.dragState}
        dragOverTarget={m.dragOverTarget}
        onCellClick={m.onCellClick}
        onChange={m.updateText}
        onKeyDown={m.handleKeyDown}
        onBlur={m.handleLineBlur}
        onGripPointerDown={m.onGripPointerDown}
      />

      <div className="mt-9 grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        {m.anyRisks ? (
          <CategorizedRiskGroups
            anyRisks={m.anyRisks}
            risksByColor={m.risksByColor}
            collapsed={m.collapsed}
            setCollapsed={m.setCollapsed}
            onChangeRisk={m.updateText}
            onRiskKeyDown={m.handleRiskKeyDown}
            onChangeSub={m.updateSubText}
            onSubKeyDown={m.handleSubKeyDown}
            onToggleStar={m.toggleStar}
          />
        ) : (
          <MitigationsTablePlaceholder />
        )}
        <ActionsAside
          allActions={m.allActions}
          onChangeSub={m.updateSubText}
          onToggleStar={m.toggleStar}
        />
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
