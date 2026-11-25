"use client";

import React, { useId, useState } from "react";
import { cn } from "@/lib/utils";
import DefinitionTerm from "./DefinitionTerm";
import { useGuidance } from "./GuidanceContext";
import {
  FEWER_INSTRUCTIONS,
  MORE_INSTRUCTIONS,
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

export const GUIDANCE_LINK_BUTTON_CLASS =
  "rounded-sm text-[13px] text-rm-ink underline decoration-rm-muted-2 underline-offset-2 outline-none hover:decoration-rm-ink focus-visible:ring-2 focus-visible:ring-rm-ring";

/** Opens the example finished plan. */
export function ExamplePlanButton() {
  const { showExamplePlan } = useGuidance();
  return (
    <button
      type="button"
      onClick={showExamplePlan}
      className="inline-flex h-7 items-center rounded-md border border-rm-border-strong bg-rm-surface px-2.5 text-[13px] font-medium text-rm-ink outline-none transition-colors hover:bg-rm-surface-hover focus-visible:ring-2 focus-visible:ring-rm-ring"
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
  className,
}: GuidanceBriefProps) {
  const { enabled } = useGuidance();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  if (!enabled) return null;
  return (
    <div
      className={cn(
        "border-b border-rm-divider px-3 py-2.5 text-sm leading-relaxed text-rm-ink sm:px-4 sm:py-3",
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
        {examplePlan ? <ExamplePlanButton /> : null}
      </div>
    </div>
  );
}
