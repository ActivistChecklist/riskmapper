"use client";

import React, { useId, useState } from "react";
import { ExamplePlanButton, GUIDANCE_LINK_BUTTON_CLASS, LeadLine } from "./GuidanceBrief";
import { useGuidance } from "./GuidanceContext";
import { RuckusLink } from "./RuckusCredit";
import { FEWER_INSTRUCTIONS, INTRO, MORE_INSTRUCTIONS } from "./guidanceCopy";

/** Opens the page above step 1: what a safety plan is for, and the credit. */
export default function SafetyPlanningIntro() {
  const { enabled } = useGuidance();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  if (!enabled) return null;
  return (
    <section
      aria-labelledby={`${bodyId}-h`}
      className="mb-5 w-full rounded-lg border border-rm-border bg-rm-surface-2 px-3 py-3 text-sm leading-relaxed text-rm-ink sm:px-4 sm:py-3.5"
    >
      <h2 id={`${bodyId}-h`} className="mb-1 text-base font-semibold leading-tight">
        {INTRO.heading}
      </h2>
      <p className="max-w-[78ch]">
        <LeadLine lead={INTRO.lead} />
      </p>
      {open ? (
        <div id={bodyId} className="max-w-[78ch] text-rm-muted">
          {INTRO.more.map((p) => (
            <p key={p} className="mt-2">
              {p}
            </p>
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-[13px] text-rm-muted">
        Adapted with permission from <RuckusLink />.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen((o) => !o)}
          className={GUIDANCE_LINK_BUTTON_CLASS}
        >
          {open ? FEWER_INSTRUCTIONS : MORE_INSTRUCTIONS}
        </button>
        <ExamplePlanButton />
      </div>
    </section>
  );
}
