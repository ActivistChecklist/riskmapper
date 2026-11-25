import React from "react";
import { cn } from "@/lib/utils";
import { RUCKUS_NAME, RUCKUS_URL } from "./guidanceCopy";

/** Ruckus Society's name, linked to their resources page in a new tab. */
export function RuckusLink({ className }: { className?: string }) {
  return (
    <a
      href={RUCKUS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "font-medium text-rm-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rm-ring",
        className,
      )}
    >
      {RUCKUS_NAME}
    </a>
  );
}
