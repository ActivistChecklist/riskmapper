"use client";

import React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Lightbulb, LightbulbOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGuidance } from "./GuidanceContext";

/** The labelled switch itself: a track, then the word "Guidance". */
function LabelledSwitch({ className }: { className?: string }) {
  const { enabled, setEnabled } = useGuidance();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
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
      Guidance
    </button>
  );
}

/**
 * One switch in the top bar turns every piece of guidance on or off. A
 * bare switch says nothing about what it controls, so where the top bar
 * has no room for the label (below sm) it becomes a lightbulb, crossed out
 * while guidance is off, that opens the labelled switch.
 */
export default function GuidanceSwitch({ className }: { className?: string }) {
  const { enabled } = useGuidance();
  const Icon = enabled ? Lightbulb : LightbulbOff;
  return (
    <>
      <LabelledSwitch className={cn("hidden sm:inline-flex", className)} />
      <PopoverPrimitive.Root>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={`Guidance: ${enabled ? "on" : "off"}`}
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-rm-ink outline-none transition-colors hover:bg-rm-surface-hover focus-visible:ring-2 focus-visible:ring-rm-ring sm:hidden",
              className,
            )}
          >
            <Icon size={16} strokeWidth={2} aria-hidden />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side="bottom"
            align="end"
            sideOffset={6}
            collisionPadding={12}
            className="z-50 rounded-lg border border-rm-border-strong bg-rm-surface p-1 shadow-lg outline-none"
          >
            <LabelledSwitch />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </>
  );
}
