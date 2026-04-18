"use client";

import React from "react";
import { cn } from "@/lib/utils";
import StepBadge from "./StepBadge";

export type StepHeadingRowProps = React.HTMLAttributes<HTMLDivElement> & {
  step: 1 | 2 | 3;
  children: React.ReactNode;
};

/** Shared “STEP n” badge + label row (alignment, gap, typography). */
export default function StepHeadingRow({
  step,
  children,
  className,
  ...props
}: StepHeadingRowProps) {
  return (
    <div
      className={cn(
        "flex flex-nowrap items-center gap-3 text-base font-medium leading-snug text-rm-ink/85 sm:text-[1.05rem]",
        className,
      )}
      {...props}
    >
      <StepBadge step={step} />
      <span className="min-w-0 flex-1 leading-snug">{children}</span>
    </div>
  );
}
