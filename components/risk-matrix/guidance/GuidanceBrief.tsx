"use client";

import React, { useId, useState } from "react";
import { cn } from "@/lib/utils";
import DefinitionTerm from "./DefinitionTerm";
import { useGuidance, type StepExample } from "./GuidanceContext";
import { GUIDANCE_LINK_BUTTON_CLASS, GUIDANCE_SMALL_BUTTON_CLASS } from "./linkButton";
import {
  FEWER_INSTRUCTIONS,
  HIDE_EXAMPLES,
  MORE_INSTRUCTIONS,
  SHOW_EXAMPLES,
  SHOW_EXAMPLE_PLAN,
  type Lead,
} from "./guidanceCopy";

export function LeadLine({ lead }: { lead: Lead }) {
  return (
    <>
      {lead.strong ? (
        <strong className="font-semibold">{lead.strong}</strong>
      ) : null}
      {lead.parts.map((part, i) =>
        typeof part === "string" ? (
          <React.Fragment key={i}>{part}</React.Fragment>
        ) : (
          <DefinitionTerm key={i} term={part.term}>
            {part.text}
          </DefinitionTerm>
        ),
      )}
    </>
  );
}


/** Opens the example finished plan. */
export function ExamplePlanButton() {
  const { showExamplePlan } = useGuidance();
  return (
    <button
      type="button"
      onClick={(e) => showExamplePlan(e.currentTarget)}
      className={GUIDANCE_SMALL_BUTTON_CLASS}
    >
      {SHOW_EXAMPLE_PLAN}
    </button>
  );
}

export type GuidanceBriefProps = {
  lead: Lead;
  /** Paragraphs behind "More instructions". */
  more: readonly string[];
  /** Anything else behind "More instructions", after the paragraphs. */
  extra?: React.ReactNode;
  /** Show the "Show an example finished plan" button beside the toggle. */
  examplePlan?: boolean;
  /**
   * The step's inline example, for a "Show examples" / "Hide examples" link
   * here. Steps 1 and 3 put that link in their example box instead.
   */
  example?: StepExample;
  className?: string;
};

/**
 * A step's guidance: one lead line, with the step's full instructions one
 * click away. Renders nothing while guidance is off.
 */
export default function GuidanceBrief({
  lead,
  more,
  extra,
  examplePlan = false,
  example,
  className,
}: GuidanceBriefProps) {
  const { enabled } = useGuidance();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  if (!enabled) return null;
  return (
    <div
      className={cn(
        // The same gray as the example areas and the step bodies, so only
        // the person's own entries are white. The strong edge separates the
        // instructions from the body, and is also the top of step 2's grid.
        "border-b border-rm-border-strong bg-rm-well px-3 py-2.5 text-sm leading-relaxed text-rm-ink sm:px-4 sm:py-3",
        className,
      )}
    >
      <p className="max-w-[78ch]">
        <LeadLine lead={lead} />
      </p>
      {open ? (
        <div id={bodyId} className="max-w-[78ch] text-rm-muted">
          {more.map((p) => (
            <p key={p} className="mt-2">
              {p}
            </p>
          ))}
          {extra}
        </div>
      ) : null}
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
        {example ? (
          <button
            type="button"
            onClick={example.toggle}
            className={GUIDANCE_LINK_BUTTON_CLASS}
          >
            {example.shown ? HIDE_EXAMPLES : SHOW_EXAMPLES}
          </button>
        ) : null}
        {examplePlan ? <ExamplePlanButton /> : null}
      </div>
    </div>
  );
}
