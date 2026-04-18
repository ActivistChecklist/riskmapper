"use client";

import React from "react";
import { Star } from "lucide-react";
import type { CellKey, StarredAction } from "./types";
import { GROUP_ACTION_BORDER } from "./constants";
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
  const borderTone = GROUP_ACTION_BORDER[groupTone];
  const kindPhrase = subType === "reduce" ? "Reduction for" : "Preparation for";
  const riskLabel = parentText.trim() || "Untitled risk";
  return (
    <div
      className={[
        "my-1.5 flex items-start rounded-[5px] border border-black/12 bg-white py-1.5 pr-2.5 pl-2.5",
        "border-l-[8px]",
        borderTone,
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
          className="px-1.5 py-0.5 text-[15px] font-semibold"
        />
        <div className="ml-1.5 mt-0.5 text-xs leading-snug tracking-wide text-rm-ink/80">
          <span className="text-rm-ink/65">{kindPhrase}</span>{" "}
          <span className="text-rm-ink/72 italic">{riskLabel}</span>
        </div>
      </div>
    </div>
  );
});

export default ActionRow;
