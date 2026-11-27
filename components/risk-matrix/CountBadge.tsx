import React from "react";
import { cn } from "@/lib/utils";

/**
 * A count in a small rounded pill, beside a section's name.
 *
 * `onPrimary` sits on the teal header strip. It darkens the strip rather
 * than lightening it, so the light text keeps WCAG AA contrast at this size.
 */
export default function CountBadge({
  count,
  variant = "default",
  className,
}: {
  count: number;
  variant?: "default" | "onPrimary";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold normal-case leading-none tracking-normal tabular-nums",
        variant === "onPrimary"
          ? "bg-black/20 text-rm-primary-fg"
          : "bg-rm-ink/10 text-rm-ink",
        className,
      )}
    >
      {count}
    </span>
  );
}
