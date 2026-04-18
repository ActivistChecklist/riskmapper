"use client";

import React from "react";
import StepBadge from "./StepBadge";

/** Same heading row pattern as steps 1–2; sits above the bordered mitigations card. */
export default function MitigationsStep3Prompt() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 text-base font-medium text-rm-ink/85 sm:text-[1.05rem]">
      <StepBadge step={3} />
      <span className="min-w-0 leading-snug">
        Brainstorm ways you can mitigate and prepare for these risks.
      </span>
    </div>
  );
}
