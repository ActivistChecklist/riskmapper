"use client";

import React from "react";
import LineRow from "./LineRow";
import StepBadge from "./StepBadge";
import type { DragState, LineLocation, PoolLine } from "./types";

export type RiskPoolSectionProps = {
  pool: PoolLine[];
  dragState: DragState | null;
  dragOverTarget: string | null;
  /** When false, step 2 stays hidden until persisted workspace is applied (avoids a flash). */
  workspaceReady: boolean;
  hasCompletedFirstDragToMatrix: boolean;
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
  hasCompletedFirstDragToMatrix,
  onPoolClick,
  onChange,
  onKeyDown,
  onBlur,
  onGripPointerDown,
}: RiskPoolSectionProps) {
  const showStep2Hint =
    workspaceReady && !hasCompletedFirstDragToMatrix;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-base font-medium text-rm-ink/85 sm:text-[1.05rem]">
        <StepBadge step={1} />
        <span className="min-w-0 leading-snug">
          What risks concern you the most right now?
        </span>
      </div>
      <div
        data-drop-target="pool"
        onClick={onPoolClick}
        className={[
          "mb-6 w-full max-w-[42ch] min-h-[100px] cursor-text rounded-md border border-black/12 bg-white px-2.5 py-2",
          dragOverTarget === "pool"
            ? "shadow-[inset_0_0_0_2px_rgba(0,0,0,0.35)]"
            : "",
        ].join(" ")}
      >
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
          "mt-2",
          workspaceReady ? "min-h-[3.25rem]" : "min-h-0",
        ].join(" ")}
      >
        <p
          className={[
            "flex flex-wrap items-center gap-3 text-base font-medium leading-snug text-rm-ink/85 sm:text-[1.05rem]",
            workspaceReady ? "transition-opacity duration-200" : "",
            showStep2Hint ? "opacity-100" : "pointer-events-none opacity-0",
          ].join(" ")}
          aria-hidden={!showStep2Hint}
        >
          <StepBadge step={2} />
          <span className="min-w-0 leading-snug">
            Drag the risks from the pool into the matrix when you are ready to
            categorize them.
          </span>
        </p>
      </div>
    </>
  );
}
