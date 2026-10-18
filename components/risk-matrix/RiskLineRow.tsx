"use client";

import React from "react";
import type { CellKey, GridLine } from "./types";
import AutoTextarea from "./AutoTextarea";

export type RiskLineRowProps = {
  line: GridLine;
  cellKey: CellKey;
  onChange: (loc: CellKey, id: string, text: string) => void;
  onKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    cellKey: CellKey,
    line: GridLine,
  ) => void;
};

const RiskLineRow = React.memo(function RiskLineRow({
  line,
  cellKey,
  onChange,
  onKeyDown,
}: RiskLineRowProps) {
  return (
    <div className="flex items-start py-0.5">
      <AutoTextarea
        riskLineId={line.id}
        value={line.text}
        onChange={(e) => onChange(cellKey, line.id, e.target.value)}
        onKeyDown={(e) => onKeyDown(e, cellKey, line)}
        // Medium weight: the risk is the heading its two mitigation
        // lists sit under in the step 3 table.
        className="py-0.5 pr-1.5 pl-0 text-[15px] font-medium"
      />
    </div>
  );
});

export default RiskLineRow;
