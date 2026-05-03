"use client";

import React from "react";
import LineRow from "./LineRow";
import PointerAddLineButton from "./PointerAddLineButton";
import {
  CELL_BG_CLASSES,
  COL_LABELS,
  POINTER_ADD_ROW_HOVER_CLASSES,
  ROW_LABELS,
} from "./constants";
import type { CellKey, DragState, GridLine, LineLocation, PoolLine } from "./types";

export type LikelihoodImpactMatrixProps = {
  grid: Record<CellKey, GridLine[]>;
  dragState: DragState | null;
  dragOverTarget: string | null;
  onAddCellLine: (cellKey: CellKey) => void;
  onCellClick: (e: React.MouseEvent, key: CellKey) => void;
  onChange: (loc: LineLocation, id: string, text: string) => void;
  onKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    loc: LineLocation,
    line: PoolLine | GridLine,
  ) => void;
  onBlur: (
    e: React.FocusEvent<HTMLTextAreaElement>,
    loc: LineLocation,
    line: PoolLine | GridLine,
  ) => void;
  onGripPointerDown: (e: React.PointerEvent, id: string) => void;
  /** Sits under a {@link StepSection} header — flat top, rounded bottom. */
  stepSectionFrame?: boolean;
};

export default function LikelihoodImpactMatrix({
  grid,
  dragState,
  dragOverTarget,
  onAddCellLine,
  onCellClick,
  onChange,
  onKeyDown,
  onBlur,
  onGripPointerDown,
  stepSectionFrame = false,
}: LikelihoodImpactMatrixProps) {
  return (
    <div
      className={[
        // overflow-clip (not -hidden) lets the sticky impact-axis row
        // below stay pinned to the viewport. overflow-hidden establishes
        // a scrolling container that swallows sticky positioning.
        "grid grid-cols-[32px_repeat(3,1fr)] grid-rows-[auto_repeat(3,minmax(140px,auto))] gap-px overflow-clip bg-rm-border sm:grid-cols-[44px_repeat(3,1fr)]",
        stepSectionFrame
          ? "rounded-none border border-rm-border border-t-0 sm:rounded-none sm:rounded-b-md"
          : "rounded-none border border-rm-border sm:rounded",
      ].join(" ")}
    >
      {/* Header row (corner + 3 column labels) is sticky so the
          impact axis stays visible while you scroll past tall cells.
          `--rm-topbar-h` is 0 below md, so the header sticks at the
          viewport top on mobile and just under the sticky top bar at
          md+. z-10 keeps it above cell content but below the title bar
          (z-30 in MatrixTopBar). */}
      <div
        className="sticky z-10 bg-rm-canvas"
        style={{ top: "var(--rm-topbar-h, 0px)" }}
      />
      {COL_LABELS.map((label) => (
        <div
          key={label}
          className="sticky z-10 flex items-center justify-center bg-rm-canvas px-1 py-2 text-xs font-medium tracking-wide opacity-95 sm:px-2 sm:py-2.5 sm:text-sm"
          style={{ top: "var(--rm-topbar-h, 0px)" }}
        >
          {label}
        </div>
      ))}

      {[0, 1, 2].map((row) => (
        <React.Fragment key={row}>
          <div className="flex items-center justify-center bg-rm-canvas px-0 py-1 text-xs font-medium tracking-wide opacity-95 sm:py-1.5 sm:text-sm">
            <span className="whitespace-nowrap [writing-mode:vertical-rl] rotate-180">
              {ROW_LABELS[row]}
            </span>
          </div>
          {[0, 1, 2].map((col) => {
            const key = `${row}-${col}` as CellKey;
            const cellLines = grid[key] || [];
            const isDragOver = dragOverTarget === key;
            return (
              <div
                key={col}
                data-drop-target={key}
                onClick={(e) => onCellClick(e, key)}
                className={[
                  CELL_BG_CLASSES[row][col],
                  "group relative flex min-h-0 cursor-text flex-col px-1 py-1 transition-shadow duration-100 sm:px-1.5",
                  isDragOver
                    ? "shadow-[inset_0_0_0_2px_rgba(0,0,0,0.5)] dark:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.5)]"
                    : "",
                ].join(" ")}
              >
                <div className="flex min-h-0 flex-1 flex-col">
                  {cellLines.map((line) => (
                    <LineRow
                      key={line.id}
                      line={line}
                      loc={key}
                      isDragging={!!dragState && dragState.id === line.id}
                      onChange={onChange}
                      onKeyDown={onKeyDown}
                      onBlur={onBlur}
                      onGripPointerDown={onGripPointerDown}
                      inCell
                    />
                  ))}
                </div>
                <div
                  className={[
                    "mt-auto flex shrink-0 justify-start pt-0.5",
                    POINTER_ADD_ROW_HOVER_CLASSES,
                  ].join(" ")}
                >
                  <PointerAddLineButton
                    ariaLabel="Add another risk in this matrix cell"
                    onTrigger={() => onAddCellLine(key)}
                  />
                </div>
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
