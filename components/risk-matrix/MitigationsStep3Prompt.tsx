"use client";

import React from "react";
import StepBadge from "./StepBadge";

/** Intro above the mitigations table — not part of the sticky column header. */
export default function MitigationsStep3Prompt() {
  return (
    <div className="border-b border-black/8 bg-white px-3 py-3 sm:px-4 sm:py-3.5">
      <div className="flex flex-wrap items-center gap-3 text-base font-medium leading-snug text-rm-ink/90 sm:text-[1.05rem]">
        <StepBadge step={3} />
        <span className="min-w-0">
          Brainstorm ways you can mitigate and prepare for these risks.
        </span>
      </div>
    </div>
  );
}
