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
        // Sticks below the (md+ only) sticky title bar via --rm-topbar-h,
        // which falls back to 0px on mobile.
        className="sticky z-[21] grid gap-2 border-b border-rm-border bg-rm-surface px-2 py-2 text-xs font-medium leading-snug opacity-95 shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:gap-4 sm:px-4 sm:py-3 sm:text-sm [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
        style={{ top: "var(--rm-topbar-h, 0px)" }}
      >
        <div className="px-1 py-0.5 sm:px-2">Risk</div>
        <div className="px-1 py-0.5 sm:px-2">
          <span className="sm:hidden">Reduce likelihood</span>
          <span className="hidden sm:inline">
            How can we reduce the likelihood of this happening?
          </span>
        </div>
        <div className="px-1 py-0.5 sm:px-2">
          <span className="sm:hidden">Prepare if it happens</span>
          <span className="hidden sm:inline">
            How can we limit the harm if it happens?
          </span>
        </div>
      </div>
    );
  },
);

MitigationsTableHeaderRow.displayName = "MitigationsTableHeaderRow";

export default MitigationsTableHeaderRow;
