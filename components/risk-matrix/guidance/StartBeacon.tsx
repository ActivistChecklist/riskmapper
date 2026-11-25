"use client";

import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { START_HERE } from "./guidanceCopy";

/**
 * A pulsing dot on the corner of step 1's add field, shown on a blank
 * matrix whether or not guidance is on, to say where to begin. It pings,
 * rests, and pings again (see `.rm-beacon-ping` in globals.css), and holds
 * still for people who ask for less motion. Hovering it says where to
 * start; clicking it puts the caret in the field. It is decorative to
 * assistive tech: the field has its own label, and the step's instructions
 * say what to do.
 */
export default function StartBeacon({ onClick }: { onClick?: () => void }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid="start-beacon"
            aria-hidden
            onClick={onClick}
            // A 32px hit area around the 16px dot, centered on the field's
            // corner, so the tooltip is easy to find with a pointer.
            className="absolute -left-4 -top-4 z-10 flex size-8 cursor-pointer items-center justify-center"
          >
            <span className="relative size-4">
              <span className="rm-beacon-ping absolute inset-0 rounded-full bg-rm-beacon" />
              <span className="absolute inset-0 rounded-full border-2 border-rm-surface bg-rm-beacon" />
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{START_HERE}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
