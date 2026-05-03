"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const defaultLabel = (
  <>
    <Plus size={12} strokeWidth={2.25} className="shrink-0 opacity-90" aria-hidden />
    <span>add</span>
  </>
);

export type PointerAddLineButtonProps = {
  onTrigger: () => void;
  /** Visible label; default is Plus icon + “add”. */
  children?: React.ReactNode;
  className?: string;
  /** Accessible name (visible label stays short). */
  ariaLabel?: string;
  /** Hover hint (defaults to Enter shortcut copy). */
  tooltip?: React.ReactNode;
};

/**
 * Primary editing is keyboard (Enter). This control is for pointer-first users and
 * is kept out of the tab order so keyboard-first navigation stays linear.
 */
export default function PointerAddLineButton({
  onTrigger,
  children,
  className,
  ariaLabel = "Add another line",
  tooltip = (
    <>
      Click to add a line. You can also press{" "}
      <kbd className="rounded border border-rm-border-strong bg-rm-surface-hover px-1 font-mono text-[10px]">
        Enter
      </kbd>{" "}
      while typing in a line to add another.
    </>
  ),
}: PointerAddLineButtonProps) {
  const label = children ?? defaultLabel;
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            tabIndex={-1}
            aria-label={ariaLabel}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTrigger();
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded border border-transparent px-1.5 py-0.5 text-left text-[11px] font-medium text-rm-muted",
              "hover:border-rm-border hover:bg-rm-surface hover:text-rm-ink",
              "focus-visible:border-rm-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rm-ring",
              className,
            )}
          >
            {label}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-snug">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
