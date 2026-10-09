"use client";

import React from "react";
import { GripVertical } from "lucide-react";
import type { LineLocation, PoolLine, GridLine } from "./types";
import LineShell from "./LineShell";
import { cn } from "@/lib/utils";

export type LineRowProps = {
  line: PoolLine | GridLine;
  loc: LineLocation;
  isDragging: boolean;
  /** Draws the drop insertion line on this edge of the row. */
  dropEdge?: "before" | "after" | null;
  placeholder?: string;
  onBlur?: (
    e: React.FocusEvent<HTMLTextAreaElement>,
    loc: LineLocation,
    line: PoolLine | GridLine,
  ) => void;
  onChange: (loc: LineLocation, id: string, text: string) => void;
  onKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    loc: LineLocation,
    line: PoolLine | GridLine,
  ) => void;
  onGripPointerDown: (e: React.PointerEvent, id: string) => void;
  inCell: boolean;
};

const LineRow = React.memo(function LineRow({
  line,
  loc,
  isDragging,
  dropEdge = null,
  placeholder,
  onBlur,
  onChange,
  onKeyDown,
  onGripPointerDown,
  inCell,
}: LineRowProps) {
  const isEmpty = line.text.length === 0;
  return (
    <LineShell
      dataAttributes={{ "data-row-id": line.id }}
      className={cn(
        loc === "pool" ? "my-1" : "my-0.5",
        isDragging ? "opacity-35" : "opacity-100",
        // Centered in the 4px gap between rows: 1px border + 2px offset
        // + half the 2px line.
        dropEdge &&
          "relative before:pointer-events-none before:absolute before:-inset-x-px before:h-0.5 before:rounded-full before:bg-rm-ink",
        dropEdge === "before" && "before:-top-1",
        dropEdge === "after" && "before:-bottom-1",
        isEmpty
          ? "border-transparent bg-transparent"
          : inCell
            ? "border-rm-border bg-white/55 dark:bg-white/[0.05]"
            : "border-rm-border bg-rm-line",
      )}
      leftAffordance={
        <span
          onPointerDown={(e) => !isEmpty && onGripPointerDown(e, line.id)}
          title={isEmpty ? "" : "drag to move"}
          className={cn(
            "flex w-[18px] shrink-0 items-center justify-center self-stretch select-none touch-none sm:w-[22px]",
            isEmpty ? "cursor-default opacity-15" : "cursor-grab opacity-50",
          )}
        >
          <GripVertical size={14} />
        </span>
      }
      textareaProps={{
        lineId: line.id,
        value: line.text,
        placeholder,
        onChange: (e) => onChange(loc, line.id, e.target.value),
        onKeyDown: (e) => onKeyDown(e, loc, line),
        onBlur: (e) => onBlur?.(e, loc, line),
        className: "max-sm:pl-0 max-sm:pr-1 sm:pl-1.5 sm:pr-1.5",
      }}
    />
  );
});

export default LineRow;
