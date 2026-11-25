"use client";

import React from "react";
import { beThoroughText } from "./guidanceCopy";

/**
 * The one nudge the guidance gives: shown under the step 1 list when a new
 * entry looks too short to be specific. It is a suggestion, so one click
 * puts it away for good for that entry.
 */
export default function VagueRiskTip({
  text,
  onDismiss,
}: {
  /** The entry that looks vague, or null for no tip. */
  text: string | null;
  onDismiss: () => void;
}) {
  return (
    <div role="status" aria-live="polite">
      {text ? (
        <div className="mt-2 max-w-[56ch] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] leading-snug text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="mb-0.5 font-semibold">Tip</p>
          <p>{beThoroughText(text)}</p>
          <button
            type="button"
            onClick={onDismiss}
            className="mt-2 rounded-md border border-amber-400 px-2.5 py-0.5 text-xs font-medium outline-none hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-rm-ring dark:border-amber-600 dark:hover:bg-amber-900/50"
          >
            Got it
          </button>
        </div>
      ) : null}
    </div>
  );
}
