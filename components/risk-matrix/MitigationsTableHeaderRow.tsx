"use client";

import React from "react";

/**
 * Sticky column labels for the categorized risks / mitigations grid only.
 */
const MitigationsTableHeaderRow = React.forwardRef<HTMLDivElement>(
  function MitigationsTableHeaderRow(_props, ref) {
    return (
      <div
        ref={ref}
        className="sticky top-0 z-[21] grid gap-4 border-b border-black/10 bg-white px-3 py-2.5 text-sm font-medium leading-snug opacity-95 shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:px-4 sm:py-3 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
      >
        <div className="px-2 py-0.5">Risk</div>
        <div className="px-2 py-0.5">
          What can we do to reduce the likelihood of this happening?
        </div>
        <div className="px-2 py-0.5">
          What can we do to prepare for if it does happen?
        </div>
      </div>
    );
  },
);

MitigationsTableHeaderRow.displayName = "MitigationsTableHeaderRow";

export default MitigationsTableHeaderRow;
