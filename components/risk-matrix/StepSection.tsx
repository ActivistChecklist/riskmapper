"use client";

import React from "react";
import { MATRIX_READING_COLUMN_CLASS } from "./constants";
import StepBadge from "./StepBadge";
import { cn } from "@/lib/utils";

export type StepSectionProps = {
  step: 1 | 2 | 3;
  /** Heading copy (step prompt). */
  title: React.ReactNode;
  /** Region under the primary header (pool, matrix, mitigations table, …). */
  children: React.ReactNode;
  actions?: React.ReactNode;
  /** When true (default), cap width to the reading column; step 2 matrix uses false. */
  readingWidth?: boolean;
  className?: string;
};

/**
 * Step prompt + optional actions on a primary header strip, joined to a white body
 * in one bordered card — consistent across steps 1–3.
 */
export default function StepSection({
  step,
  title,
  children,
  actions,
  readingWidth = true,
  className,
}: StepSectionProps) {
  return (
    <div
      className={cn(
        readingWidth ? MATRIX_READING_COLUMN_CLASS : "w-full min-w-0",
        className,
      )}
    >
      <div className="overflow-hidden rounded-md border border-black/10 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-white/25 bg-rm-primary px-3 py-2.5 text-rm-primary-fg sm:items-center sm:px-4 sm:py-3">
          <StepBadge step={step} variant="onPrimary" />
          <span className="min-w-0 max-w-prose flex-1 text-base font-medium leading-snug sm:text-[1.05rem]">
            {title}
          </span>
          {actions ? (
            <div className="flex shrink-0 items-center justify-end gap-2 sm:ml-auto">
              {actions}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 bg-white">{children}</div>
      </div>
    </div>
  );
}
