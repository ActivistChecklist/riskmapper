"use client";

import React from "react";
import MitigationsTableHeaderRow from "./MitigationsTableHeaderRow";

import { cn } from "@/lib/utils";

type Props = {
  embeddedInStepSection?: boolean;
};

/**
 * Shown before any risk is placed on the matrix: same table header as the real
 * grid; dashed body explains what will appear here.
 */
export default function MitigationsTablePlaceholder({
  embeddedInStepSection = false,
}: Props) {
  return (
    <div
      className={cn(
        "min-w-0 bg-rm-surface",
        embeddedInStepSection
          ? "mb-0 rounded-t-none rounded-b-md border border-x-0 border-b border-rm-border border-t border-rm-border"
          : "mb-3.5 rounded-md border border-rm-border",
      )}
    >
      <MitigationsTableHeaderRow />
      <div className="flex min-h-[12.5rem] flex-col bg-rm-surface px-3 pb-3 pt-2.5 sm:min-h-[14rem]">
        <div
          className="flex min-h-[10.5rem] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-rm-border-strong bg-rm-surface-2 px-4 py-8 sm:min-h-[11.5rem]"
          aria-label="Placeholder: after you place risks in the matrix, mitigation rows will appear in this area."
        >
          <p className="max-w-[20rem] text-center text-[13px] leading-snug font-normal italic text-rm-muted-2 sm:text-sm sm:leading-relaxed">
            Drag a risk from the pool into a cell in the risk matrix table above.
            Your risks will show up here.
          </p>
        </div>
      </div>
    </div>
  );
}
