"use client";

import React from "react";
import { GripVertical } from "lucide-react";
import type { LineLocation, PoolLine, GridLine } from "./types";
import AutoTextarea from "./AutoTextarea";

export type LineRowProps = {
  line: PoolLine | GridLine;
  loc: LineLocation;
  isDragging: boolean;
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
  placeholder,
  onBlur,
  onChange,
  onKeyDown,
  onGripPointerDown,
  inCell,
}: LineRowProps) {
  const isEmpty = line.text.length === 0;
  const verticalMargin = loc === "pool" ? "my-1" : "my-0.5";
  return (
    <div
      data-row-id={line.id}
      className={[
        `${verticalMargin} flex items-start gap-0 rounded-[5px] border p-0 transition-[background,border-color,box-shadow] duration-150 sm:gap-0.5`,
        isDragging ? "opacity-35" : "opacity-100",
        isEmpty
          ? "border-transparent bg-transparent"
          : inCell
            ? "border-black/8 bg-white/55"
            : "border-black/8 bg-rm-line",
        "hover:border-black/30 hover:bg-white/85 hover:ring-1 hover:ring-black/12 focus-within:border-rm-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-rm-primary/20",
      ].join(" ")}
    >
      <span
        onPointerDown={(e) => !isEmpty && onGripPointerDown(e, line.id)}
        title={isEmpty ? "" : "drag to move"}
        className={[
          "flex w-[18px] shrink-0 items-center justify-center self-stretch select-none touch-none sm:w-[22px]",
          isEmpty ? "cursor-default opacity-15" : "cursor-grab opacity-50",
        ].join(" ")}
      >
        <GripVertical size={14} />
      </span>
      <AutoTextarea
        lineId={line.id}
        value={line.text}
        placeholder={placeholder}
        onChange={(e) => onChange(loc, line.id, e.target.value)}
        onKeyDown={(e) => onKeyDown(e, loc, line)}
        onBlur={(e) => onBlur?.(e, loc, line)}
        className="max-sm:pl-0 max-sm:pr-1 sm:pl-1.5 sm:pr-1.5"
      />
    </div>
  );
});

export default LineRow;
