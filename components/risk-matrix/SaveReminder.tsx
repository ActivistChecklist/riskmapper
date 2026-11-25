import React from "react";
import { Save } from "lucide-react";
import { cn } from "@/lib/utils";

export const SAVE_REMINDER_HEADING = "Save your plan";

/** The line the save reminder shows, beside the Export menu. */
export const SAVE_REMINDER = "Make sure to save a copy somewhere safe.";

/**
 * A reminder to keep a copy of the plan, with the Export menu right there.
 *
 * It is the easiest step to forget, so it is drawn to be noticed: a teal
 * edge, a heading and a filled button. It is not guidance either: it stays
 * when the Guidance switch is off, since losing the plan matters whether or
 * not someone wants the instructions.
 */
export default function SaveReminder({
  exportMenu,
  className,
}: {
  exportMenu: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="rm-save-reminder-heading"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-md border-2 border-rm-primary bg-rm-surface px-4 py-3.5 text-rm-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4)]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-rm-primary text-rm-primary-fg"
        >
          <Save size={16} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2
            id="rm-save-reminder-heading"
            className="text-base font-semibold leading-snug"
          >
            {SAVE_REMINDER_HEADING}
          </h2>
          <p className="text-sm leading-snug text-rm-muted">{SAVE_REMINDER}</p>
        </div>
      </div>
      {exportMenu}
    </section>
  );
}
