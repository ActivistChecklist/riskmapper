"use client";

import React from "react";
import { vagueRiskTipText } from "./guidanceCopy";

/**
 * The one nudge the guidance gives, drawn right under the short entry it is
 * about. Screen readers hear it through the live region in step 1, since a
 * region inserted along with its text is not reliably announced.
 */
export default function VagueRiskTip({
  text,
  onDismiss,
}: {
  /** The entry that looks vague. */
  text: string;
  onDismiss: () => void;
}) {
  return (
    <div
      data-testid="vague-risk-tip"
      className="relative mb-2.5 mt-2 max-w-[56ch] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] leading-snug text-amber-950 before:absolute before:-top-[7px] before:left-6 before:size-3 before:rotate-45 before:border-l before:border-t before:border-amber-300 before:bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950 dark:text-amber-100 dark:before:border-amber-700/60 dark:before:bg-amber-950"
    >
      <p className="mb-0.5 font-semibold">Tip</p>
      <p>{vagueRiskTipText(text)}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 rounded-md border border-amber-400 px-2.5 py-0.5 text-xs font-medium outline-none hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-rm-ring dark:border-amber-600 dark:hover:bg-amber-900/50"
      >
        Got it
      </button>
    </div>
  );
}
