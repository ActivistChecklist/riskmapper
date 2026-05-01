"use client";

import React from "react";
import { Star } from "lucide-react";
import type { CellKey, SubLine } from "./types";
import AutoTextarea from "./AutoTextarea";

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
  return (
    <div className="my-px flex items-start gap-0 sm:gap-0.5" data-mitigation-row>
      <span
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar(cellKey, parentLineId, subType, subLine.id);
        }}
        title={starred ? "Remove from actions list" : "Also show in actions list"}
        className={[
          "mt-1 flex size-[22px] shrink-0 cursor-pointer select-none items-center justify-center sm:size-[26px]",
          starred
            ? "text-rm-star-strong"
            : "text-black opacity-70 hover:opacity-100",
        ].join(" ")}
      >
        <Star
          size={16}
          fill={starred ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={starred ? 1.5 : 2.2}
        />
      </span>
      <div className="min-w-0 flex-1 rounded-[5px] border border-transparent transition-[background,border-color,box-shadow] duration-150 hover:border-black/30 hover:bg-white/85 hover:ring-1 hover:ring-black/12 focus-within:border-rm-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-rm-primary/20">
        <AutoTextarea
          subLineId={subLine.id}
          value={subLine.text}
          placeholder={placeholder}
          onChange={(e) =>
            onChange(cellKey, parentLineId, subType, subLine.id, e.target.value)
          }
          onKeyDown={(e) =>
            onKeyDown(e, cellKey, parentLineId, subType, subLine)
          }
          className="pt-1.5 pr-1.5 pb-1 pl-1.5"
        />
      </div>
    </div>
  );
});

export default MitigationLineRow;
