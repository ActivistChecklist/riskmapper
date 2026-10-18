"use client";

import React from "react";
import { Star } from "lucide-react";
import type { CellKey, StarredAction } from "./types";
import LineShell from "./LineShell";

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

/**
 * A starred mitigation in the Actions panel. Deliberately shows only the
 * action, not the risk it came from: the context made every row two lines
 * of chrome and was usually truncated past reading anyway. Styled like the
 * step 3 lines, with no resting border; LineShell's hover and focus ring
 * shows it's editable.
 */
const ActionRow = React.memo(function ActionRow({
  action,
  onChange,
  onToggleStar,
}: ActionRowProps) {
  const { subLine, cellKey, parentLineId, subType } = action;
  return (
    <LineShell
      className="my-0.5 border-transparent bg-transparent"
      leftAffordance={
        <span
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(cellKey, parentLineId, subType, subLine.id);
          }}
          title="Remove from actions list"
          className="flex w-[24px] shrink-0 cursor-pointer select-none items-center justify-center self-stretch text-rm-star-strong"
        >
          <Star size={16} fill="currentColor" strokeWidth={1.5} />
        </span>
      }
      textareaProps={{
        subLineId: subLine.id,
        value: subLine.text,
        onChange: (e) =>
          onChange(cellKey, parentLineId, subType, subLine.id, e.target.value),
        className: "py-1 pl-1.5 pr-1.5",
      }}
    />
  );
});

export default ActionRow;
