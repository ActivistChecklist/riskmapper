"use client";

import React from "react";

export type StepBadgeProps = {
  step: 1 | 2 | 3;
};

export default function StepBadge({ step }: StepBadgeProps) {
  return (
    <span className="inline-flex min-h-[1.75rem] shrink-0 items-center rounded-lg border border-black/12 bg-zinc-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-rm-ink sm:min-h-8 sm:px-3.5 sm:py-2 sm:text-sm">
      STEP {step}
    </span>
  );
}
