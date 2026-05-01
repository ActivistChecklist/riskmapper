"use client";

import React from "react";
import { Star } from "lucide-react";
import type { CellKey, StarredAction } from "./types";
import { GROUP_HEADER_CLASS } from "./constants";
import AutoTextarea from "./AutoTextarea";

export type ActionRowProps = {
  action: StarredAction;
  onChange: (
    cellKey: CellKey,
    parentLineId: string,
    subType: "reduce" | "prepare",
    subId: string,
    text: string,
  ) => void;
  onToggleStar: (
    cellKey: CellKey,
    parentLineId: string,
    subType: "reduce" | "prepare",
    subId: string,
  ) => void;
};

const ActionRow = React.memo(function ActionRow({
  action,
  onChange,
  onToggleStar,
}: ActionRowProps) {
  const { subLine, cellKey, parentLineId, subType, parentText, groupTone } =
    action;
  const riskLabel = parentText.trim() || "Untitled risk";
  const toneClass = GROUP_HEADER_CLASS[groupTone];
  return (
    <div className="my-1.5">
      <div
        className={[
          "flex items-start rounded-[5px] border border-black/12 bg-white py-1.5 pr-2.5 pl-2.5 transition-[background,border-color,box-shadow] duration-150 hover:border-black/30 hover:bg-white hover:ring-1 hover:ring-black/12 focus-within:border-rm-primary focus-within:ring-2 focus-within:ring-rm-primary/20",
        ].join(" ")}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(cellKey, parentLineId, subType, subLine.id);
          }}
          title="unmark"
          className="text-rm-star-strong mt-px flex size-[22px] shrink-0 cursor-pointer select-none items-center justify-center"
        >
          <Star size={14} fill="currentColor" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <AutoTextarea
            subLineId={subLine.id}
            value={subLine.text}
            onChange={(e) =>
              onChange(cellKey, parentLineId, subType, subLine.id, e.target.value)
            }
            className="px-1.5 py-0 text-[15px] font-semibold"
          />
        </div>
      </div>
      <div className="mt-1 min-w-0 pl-7">
        <span
          className={[
            "inline-flex max-w-full min-w-0 items-center truncate rounded-[5px] border border-black/8 px-1 py-0.5 text-[10px] font-medium leading-snug text-rm-ink",
            toneClass,
          ].join(" ")}
        >
          {riskLabel}
        </span>
      </div>
    </div>
  );
});

export default ActionRow;
