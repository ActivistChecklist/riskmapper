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
}: LikelihoodImpactMatrixProps) {
  return (
    <div className="grid grid-cols-[32px_repeat(3,1fr)] grid-rows-[auto_repeat(3,minmax(140px,auto))] gap-px overflow-hidden rounded-none border border-black/8 bg-black/6 sm:grid-cols-[44px_repeat(3,1fr)] sm:rounded">
      <div className="bg-rm-canvas" />
      {COL_LABELS.map((label) => (
        <div
          key={label}
          className="flex items-center justify-center bg-rm-canvas px-1 py-2 text-xs font-medium tracking-wide opacity-95 sm:px-2 sm:py-2.5 sm:text-sm"
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
                    ? "shadow-[inset_0_0_0_2px_rgba(0,0,0,0.5)]"
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
