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
  const isEmpty = subLine.text.length === 0;
  const starred = subLine.starred;
  return (
    <div className="my-px flex items-start">
      {isEmpty ? (
        <span aria-hidden className="mt-1 inline-block w-[26px] shrink-0" />
      ) : (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(cellKey, parentLineId, subType, subLine.id);
          }}
          title={starred ? "Remove from actions list" : "Also show in actions list"}
          className={[
            "mt-1 flex size-[26px] shrink-0 cursor-pointer select-none items-center justify-center",
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
      )}
      <AutoTextarea
        subLineId={subLine.id}
        value={subLine.text}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(cellKey, parentLineId, subType, subLine.id, e.target.value)
        }
        onKeyDown={(e) => onKeyDown(e, cellKey, parentLineId, subType, subLine)}
      />
    </div>
  );
});

export default MitigationLineRow;
