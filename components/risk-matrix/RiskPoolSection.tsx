"use client";

import React from "react";
import LineRow from "./LineRow";
import PointerAddLineButton from "./PointerAddLineButton";
import { POINTER_ADD_ROW_HOVER_CLASSES } from "./constants";
import StepHeadingRow from "./StepHeadingRow";
import type { DragState, LineLocation, PoolLine } from "./types";

export type RiskPoolSectionProps = {
  pool: PoolLine[];
  dragState: DragState | null;
  dragOverTarget: string | null;
  onAddPoolLine: () => void;
  /** When false, step 2 stays hidden until persisted workspace is applied (avoids a flash). */
  workspaceReady: boolean;
  onPoolClick: (e: React.MouseEvent) => void;
  onChange: (loc: LineLocation, id: string, text: string) => void;
  onKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    loc: LineLocation,
    line: PoolLine,
  ) => void;
  onBlur: (
    e: React.FocusEvent<HTMLTextAreaElement>,
    loc: LineLocation,
    line: PoolLine,
  ) => void;
  onGripPointerDown: (e: React.PointerEvent, id: string) => void;
};

export default function RiskPoolSection({
  pool,
  dragState,
  dragOverTarget,
  workspaceReady,
  onPoolClick,
  onAddPoolLine,
  onChange,
  onKeyDown,
  onBlur,
  onGripPointerDown,
}: RiskPoolSectionProps) {
  return (
    <>
      <StepHeadingRow step={1} className="mb-3">
        What risks concern you the most right now?
      </StepHeadingRow>
      <div
        data-drop-target="pool"
        onClick={onPoolClick}
        className={[
          "group mb-6 flex w-full max-w-[42ch] min-h-[100px] cursor-text flex-col rounded-md border border-black/12 bg-white px-2.5 py-2",
          dragOverTarget === "pool"
            ? "shadow-[inset_0_0_0_2px_rgba(0,0,0,0.35)]"
            : "",
        ].join(" ")}
      >
        <div className="min-h-0 flex-1">
          {pool.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              loc="pool"
              isDragging={!!dragState && dragState.id === line.id}
              placeholder={
                pool.length === 1 && line.text.length === 0
                  ? "Add your first risk..."
                  : pool.length > 1 &&
                      line.id === pool[pool.length - 1]?.id &&
                      line.text.length === 0
                    ? "Press Enter to add another risk"
                    : undefined
              }
              onChange={onChange}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              onGripPointerDown={onGripPointerDown}
              inCell={false}
            />
          ))}
        </div>
        <div
          className={[
            "mt-1 flex shrink-0 justify-start border-t border-black/5 pt-1",
            POINTER_ADD_ROW_HOVER_CLASSES,
          ].join(" ")}
        >
          <PointerAddLineButton
            ariaLabel="Add another risk to the pool"
            onTrigger={onAddPoolLine}
          />
        </div>
      </div>

      <div
        className={[
          "mt-2 mb-3",
          workspaceReady ? "min-h-[3.25rem]" : "min-h-0",
        ].join(" ")}
      >
        <StepHeadingRow
          step={2}
          className={
            workspaceReady
              ? "opacity-100 transition-opacity duration-200"
              : "pointer-events-none opacity-0"
          }
          aria-hidden={!workspaceReady}
        >
          Drag the risks from the pool into the matrix when you are ready to
          categorize them.
        </StepHeadingRow>
      </div>
    </>
  );
}
