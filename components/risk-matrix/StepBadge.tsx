"use client";

import React from "react";

export type StepBadgeProps = {
  step: 1 | 2 | 3;
  /** `onPrimary`: light badge on `bg-rm-primary` step headers. */
  variant?: "default" | "onPrimary";
};

export default function StepBadge({ step, variant = "default" }: StepBadgeProps) {
  return (
    <span
      className={[
        "inline-flex min-h-[1.75rem] shrink-0 items-center rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] sm:min-h-8 sm:px-3.5 sm:py-2 sm:text-sm",
        variant === "onPrimary"
          ? "border border-white/40 bg-white/15 text-rm-primary-fg shadow-none"
          : "border border-black/12 bg-zinc-100 text-rm-ink",
      ].join(" ")}
    >
      STEP {step}
    </span>
  );
}
