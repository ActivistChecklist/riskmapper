"use client";

import React from "react";
import MitigationsStep3Prompt from "./MitigationsStep3Prompt";
import MitigationsTableHeaderRow from "./MitigationsTableHeaderRow";

/**
 * Shown before any risk is placed on the matrix: same table header as the real
 * grid; dashed body explains what will appear here.
 */
export default function MitigationsTablePlaceholder() {
  return (
    <div className="min-w-0 mb-3.5 rounded-md border border-black/10 bg-white">
      <MitigationsStep3Prompt />
      <MitigationsTableHeaderRow />
      <div className="flex min-h-[12.5rem] flex-col bg-white px-3 pb-3 pt-2.5 sm:min-h-[14rem]">
        <div
          className="flex min-h-[10.5rem] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300/90 bg-zinc-50/70 px-4 py-8 sm:min-h-[11.5rem]"
          aria-label="Placeholder: after you place risks in the matrix, mitigation rows will appear in this area."
        >
          <p className="max-w-[20rem] text-center text-[13px] leading-snug font-normal italic text-zinc-400 sm:text-sm sm:leading-relaxed">
            Drag a risk from the pool into a matrix cell. Your categorized risks
            and mitigation notes will show up in this table.
          </p>
        </div>
      </div>
    </div>
  );
}
