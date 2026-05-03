"use client";

import React from "react";
import LineRow from "./LineRow";
import PointerAddLineButton from "./PointerAddLineButton";
import { POINTER_ADD_ROW_HOVER_CLASSES } from "./constants";
import StepSection from "./StepSection";
import type { DragState, LineLocation, PoolLine } from "./types";

export type RiskPoolSectionProps = {
  pool: PoolLine[];
  dragState: DragState | null;
  dragOverTarget: string | null;
  onAddPoolLine: () => void;
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
  /** Copy control on the step 1 header. */
  step1Actions?: React.ReactNode;
};

export default function RiskPoolSection({
  pool,
  dragState,
  dragOverTarget,
  onPoolClick,
  onAddPoolLine,
  onChange,
  onKeyDown,
  onBlur,
  onGripPointerDown,
  step1Actions,
}: RiskPoolSectionProps) {
  return (
    <StepSection
      step={1}
      actions={step1Actions}
      readingWidth={false}
      className="mb-6"
      title="What risks concern you the most right now?"
    >
      <div
        data-drop-target="pool"
        onClick={onPoolClick}
        className={[
          "group flex min-h-[100px] w-full cursor-text flex-col px-3 py-2.5 sm:px-4 sm:py-3",
          dragOverTarget === "pool"
            ? "shadow-[inset_0_0_0_2px_rgba(0,0,0,0.35)] dark:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.4)]"
            : "",
        ].join(" ")}
      >
        <div className="w-full max-w-[42ch]">
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
              "mt-1 flex shrink-0 justify-start border-t border-rm-divider pt-1",
              POINTER_ADD_ROW_HOVER_CLASSES,
            ].join(" ")}
          >
            <PointerAddLineButton
              ariaLabel="Add another risk to the pool"
              onTrigger={onAddPoolLine}
            />
          </div>
        </div>
      </div>
    </StepSection>
  );
}
