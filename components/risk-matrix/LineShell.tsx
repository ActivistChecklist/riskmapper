"use client";

import React from "react";
import AutoTextarea from "./AutoTextarea";
import { cn } from "@/lib/utils";

/**
 * Shared shell used by every editable line in the matrix — pool risks,
 * grid risks, mitigation sub-lines. Owns the layout (left affordance +
 * AutoTextarea) and the hover / focus ring styling so all three line
 * types look and feel like the same control. Variants supply:
 *
 *   - `leftAffordance` — drag grip, star, etc. Sits to the left of
 *     the textarea. Participates in the focus-within ring because
 *     the wrapper is on the OUTER container.
 *   - `className` — variant-specific outer styling (margins, bg
 *     while empty vs filled, dragging opacity).
 *   - `textareaProps` — forwarded to the AutoTextarea (lineId /
 *     subLineId / riskLineId, value, change/keyDown/blur handlers).
 *
 * All press-Enter / Backspace-merge behaviour lives in the
 * `onKeyDown` handler the caller wires through useRiskMatrix; the
 * shell stays UI-only so the keyboard contract is identical between
 * risks and mitigations.
 */
export type LineShellProps = {
  leftAffordance?: React.ReactNode;
  className?: string;
  textareaProps: React.ComponentProps<typeof AutoTextarea>;
  /** Forwarded as data-* attributes on the outer container. */
  dataAttributes?: Record<string, string | undefined>;
};

const SHARED_OUTER =
  // Hover background uses the surface token so it covers the cell tint
  // in both modes — in light mode rm-surface is near-white, in dark mode
  // it's the dark panel gray. The 85% opacity lets a hint of the cell
  // color show through so the row doesn't feel disconnected from its
  // group, but the dominant color is the neutral surface.
  "flex items-start gap-0 rounded-[5px] border transition-[background,border-color,box-shadow] duration-150 sm:gap-0.5 " +
  "hover:border-rm-border-strong hover:bg-rm-surface/85 hover:ring-1 hover:ring-rm-border " +
  "focus-within:border-rm-primary focus-within:bg-rm-surface focus-within:ring-2 focus-within:ring-rm-primary/20";

export default function LineShell({
  leftAffordance,
  className,
  textareaProps,
  dataAttributes,
}: LineShellProps) {
  return (
    <div className={cn(SHARED_OUTER, className)} {...dataAttributes}>
      {leftAffordance}
      <AutoTextarea {...textareaProps} />
    </div>
  );
}
