"use client";

import React from "react";
import { Star } from "lucide-react";
import type { CellKey, SubLine } from "./types";
import LineShell from "./LineShell";
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
}: MitigationLineRowProps) {
  const starred = subLine.starred;
  const isEmpty = subLine.text.length === 0;
  return (
    <LineShell
      dataAttributes={{ "data-mitigation-row": "" }}
      // Same empty/filled card treatment as the risk LineRow so the two
      // line types feel like the same control. No drag-opacity here —
      // mitigations don't drag.
      className={cn(
        "my-0.5",
        isEmpty
          ? "border-transparent bg-transparent"
          : "border-black/8 bg-white/55",
      )}
      leftAffordance={
        <span
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(cellKey, parentLineId, subType, subLine.id);
          }}
          title={
            starred ? "Remove from actions list" : "Also show in actions list"
          }
          className={cn(
            "mt-0.5 flex size-[22px] shrink-0 cursor-pointer select-none items-center justify-center sm:size-[24px]",
            starred
              ? "text-rm-star-strong"
              : "text-black opacity-70 hover:opacity-100",
          )}
        >
          <Star
            size={16}
            fill={starred ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={starred ? 1.5 : 2.2}
          />
        </span>
      }
      textareaProps={{
        subLineId: subLine.id,
        value: subLine.text,
        placeholder,
        onChange: (e) =>
          onChange(cellKey, parentLineId, subType, subLine.id, e.target.value),
        onKeyDown: (e) =>
          onKeyDown(e, cellKey, parentLineId, subType, subLine),
        className: "max-sm:pl-0 max-sm:pr-1 sm:pl-1.5 sm:pr-1.5",
      }}
    />
  );
});

export default MitigationLineRow;
