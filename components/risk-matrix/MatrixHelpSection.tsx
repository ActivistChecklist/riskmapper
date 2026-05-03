"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight, CircleHelp } from "lucide-react";

/** Expandable help copy — sits below the document toolbar and above step 1. */
export default function MatrixHelpSection() {
  const [open, setOpen] = useState(false);

  return (
    <section className="mb-5 w-full rounded-lg border border-rm-border bg-rm-surface-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rm-ink outline-none transition-colors hover:bg-rm-surface-hover focus-visible:ring-2 focus-visible:ring-rm-ring sm:px-4 sm:py-3 sm:text-[15px]"
      >
        {open ? (
          <ChevronDown size={18} className="shrink-0 opacity-70" aria-hidden />
        ) : (
          <ChevronRight size={18} className="shrink-0 opacity-70" aria-hidden />
        )}
        <CircleHelp size={17} className="shrink-0 opacity-80" aria-hidden />
        <span>How to do risk mapping</span>
      </button>
      {open ? (
        <div className="border-t border-rm-border px-3 pb-3.5 pt-4 text-sm leading-relaxed text-rm-ink/90 sm:px-4 sm:pb-4 sm:pt-5">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-3 text-base font-semibold leading-tight text-rm-ink sm:text-lg">
              How to do risk mapping
            </h2>
            <p className="mb-3 opacity-95">
              Good organizing means taking strategic risks. A risk assessment
              isn't about eliminating risk, it helps your group take bolder
              action with clearer eyes by naming what you're actually facing,
              deciding what matters most, and choosing what's worth preparing
              for. It works best done with a few people on your team.
            </p>
            <p className="mb-3">
              <span className="font-medium text-rm-ink">Name the risks.</span> Be
              concrete: <em>who</em> could do <em>what</em>. ("A
              counter-protester could try to provoke a fight." "Police
              could arrest participants for trespassing." "A leader
              could be doxxed because their name is on the sign-up page.")
              Don't try to list every possibility. Focus on what feels
              concerning for this group, this action, this place, this moment.
            </p>
            <p className="mb-3">
              <span className="font-medium text-rm-ink">
                Place each risk by impact and likelihood.
              </span>{" "}
              Impact is how bad it would be if it happened. Likelihood is how
              likely it is to actually happen for a group like yours. If you're
              unsure how likely something is, ask people doing similar work in
              your area. Grounding the estimate in real experience pulls you
              out of reactive fear.
            </p>
            <p className="mb-3">
              <span className="font-medium text-rm-ink">Add mitigations.</span>{" "}
              Under each categorized risk, brainstorm two kinds of action: ways
              to <em>reduce the likelihood</em> it happens (vet new members, use
              Signal, secure your accounts) and ways to{" "}
              <em>prepare to respond</em> if it does (know-your-rights training,
              exit routes, legal hotline saved). Star the most important ones to
              surface them in the Actions panel as your shortlist of what to
              actually go do.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
