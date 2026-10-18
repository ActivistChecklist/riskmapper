"use client";

import React from "react";
import { GripVertical, Star } from "lucide-react";
import type { CellKey, SubLine } from "./types";
import type { MitigationListRef } from "./useMitigationDrag";
import LineShell from "./LineShell";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type MitigationLineRowProps = {
  subLine: SubLine;
  cellKey: CellKey;
  parentLineId: string;
  subType: "reduce" | "prepare";
  placeholder?: string;
  onChange: (
    cellKey: CellKey,
    parentLineId: string,
    subType: "reduce" | "prepare",
    subId: string,
    text: string,
  ) => void;
  onKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    cellKey: CellKey,
    parentLineId: string,
    subType: "reduce" | "prepare",
    subLine: SubLine,
  ) => void;
  onToggleStar: (
    cellKey: CellKey,
    parentLineId: string,
    subType: "reduce" | "prepare",
    subId: string,
  ) => void;
  /** This line is being dragged; it dims in place under the preview. */
  isDragging?: boolean;
  /** Draws the drop insertion line on this edge of the row. */
  dropEdge?: "before" | "after" | null;
  onGripPointerDown?: (
    e: React.PointerEvent,
    list: MitigationListRef,
    subLine: SubLine,
  ) => void;
};

const MitigationLineRow = React.memo(function MitigationLineRow({
  subLine,
  cellKey,
  parentLineId,
  subType,
  placeholder,
  onChange,
  onKeyDown,
  onToggleStar,
  isDragging = false,
  dropEdge = null,
  onGripPointerDown,
}: MitigationLineRowProps) {
  const starred = subLine.starred;
  const draggable = subLine.text.length > 0 && Boolean(onGripPointerDown);
  return (
    <LineShell
      dataAttributes={{ "data-mitigation-row": "", "data-sub-row-id": subLine.id }}
      // No resting border or fill: mitigations are the lowest level of
      // the step 3 hierarchy and read as plain text. LineShell's hover
      // and focus treatment is what shows a line is editable. No drag-
      // opacity here, mitigations don't drag.
      className={cn(
        "group/mitrow my-0 border-transparent bg-transparent",
        isDragging ? "opacity-35" : "opacity-100",
        // Same insertion line as LineRow, centered in the gap between rows.
        dropEdge &&
          "relative before:pointer-events-none before:absolute before:-inset-x-px before:h-0.5 before:rounded-full before:bg-rm-ink",
        dropEdge === "before" && "before:-top-0.5",
        dropEdge === "after" && "before:-bottom-0.5",
      )}
      leftAffordance={
        <>
        <span
          aria-hidden
          title={draggable ? "Drag to reorder" : undefined}
          onPointerDown={(e) =>
            draggable &&
            onGripPointerDown?.(e, { cellKey, parentLineId, subType }, subLine)
          }
          className={cn(
            // Hidden until the row is hovered on pointer devices so the
            // list reads as plain text; always faintly visible on touch.
            "flex w-[14px] shrink-0 items-center justify-center self-stretch select-none touch-none text-rm-ink",
            draggable
              ? "cursor-grab opacity-40 md:opacity-0 md:group-hover/mitrow:opacity-50"
              : "pointer-events-none opacity-0",
          )}
        >
          <GripVertical size={14} />
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStar(cellKey, parentLineId, subType, subLine.id);
                }}
                className={cn(
                  // self-stretch + items-center centers the star vertically
                  // against the AutoTextarea's full height — matches LineRow's
                  // grip alignment instead of the previous mt-0.5 nudge.
                  "flex w-[22px] shrink-0 cursor-pointer select-none items-center justify-center self-stretch sm:w-[24px]",
                  starred
                    ? "text-rm-star-strong"
                    : "text-rm-ink opacity-70 hover:opacity-100",
                )}
              >
                <Star
                  size={16}
                  fill={starred ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth={starred ? 1.5 : 2.2}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {starred ? "Remove from actions list" : "Add to actions list"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        </>
      }
      textareaProps={{
        subLineId: subLine.id,
        value: subLine.text,
        placeholder,
        onChange: (e) =>
          onChange(cellKey, parentLineId, subType, subLine.id, e.target.value),
        onKeyDown: (e) =>
          onKeyDown(e, cellKey, parentLineId, subType, subLine),
        className: "py-1 max-sm:pl-0 max-sm:pr-1 sm:pl-1.5 sm:pr-1.5",
      }}
    />
  );
});

export default MitigationLineRow;
