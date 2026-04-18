"use client";

import React from "react";
import LineRow from "./LineRow";
import { CELL_BG_CLASSES, COL_LABELS, ROW_LABELS } from "./constants";
import type { CellKey, DragState, GridLine, LineLocation, PoolLine } from "./types";

export type LikelihoodImpactMatrixProps = {
  grid: Record<CellKey, GridLine[]>;
  dragState: DragState | null;
  dragOverTarget: string | null;
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
  onCellClick,
  onChange,
  onKeyDown,
  onBlur,
  onGripPointerDown,
}: LikelihoodImpactMatrixProps) {
  return (
    <div className="grid grid-cols-[44px_repeat(3,1fr)] grid-rows-[auto_repeat(3,minmax(140px,auto))] gap-px overflow-hidden rounded border border-black/8 bg-black/6">
      <div className="bg-rm-canvas" />
      {COL_LABELS.map((label) => (
        <div
          key={label}
          className="flex items-center justify-center bg-rm-canvas px-2 py-2.5 text-xs font-medium tracking-wide opacity-95 sm:text-sm"
        >
          {label}
        </div>
      ))}

      {[0, 1, 2].map((row) => (
        <React.Fragment key={row}>
          <div className="flex items-center justify-center bg-rm-canvas px-0 py-1.5 text-xs font-medium tracking-wide opacity-95 sm:text-sm">
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
                  "relative flex min-h-0 cursor-text flex-col px-1.5 py-1 transition-shadow duration-100",
                  isDragOver
                    ? "shadow-[inset_0_0_0_2px_rgba(0,0,0,0.5)]"
                    : "",
                ].join(" ")}
              >
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
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
