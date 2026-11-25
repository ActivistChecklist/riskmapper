"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useGuidance } from "./GuidanceContext";

/** One switch in the top bar turns every piece of guidance on or off. */
export default function GuidanceSwitch({ className }: { className?: string }) {
  const { enabled, setEnabled } = useGuidance();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Guidance"
      onClick={() => setEnabled(!enabled)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-sm font-medium text-rm-ink outline-none transition-colors hover:bg-rm-surface-hover focus-visible:ring-2 focus-visible:ring-rm-ring",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors motion-reduce:transition-none",
          enabled
            ? "border-rm-primary bg-rm-primary"
            : "border-rm-border-strong bg-rm-surface-2",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] size-3 rounded-full transition-transform motion-reduce:transition-none",
            enabled
              ? "translate-x-[16px] bg-rm-primary-fg"
              : "translate-x-[2px] bg-rm-muted-2",
          )}
        />
      </span>
      <span className="hidden sm:inline">Guidance</span>
    </button>
  );
}
