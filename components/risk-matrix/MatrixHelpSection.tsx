"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight, CircleHelp } from "lucide-react";

/** Expandable help copy — sits below the document toolbar and above step 1. */
export default function MatrixHelpSection() {
  const [open, setOpen] = useState(false);

  return (
    <section className="mb-5 w-full rounded-lg border border-black/10 bg-zinc-100/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rm-ink outline-none transition-colors hover:bg-black/4 focus-visible:ring-2 focus-visible:ring-black/15 sm:px-4 sm:py-3 sm:text-[15px]"
      >
        {open ? (
          <ChevronDown size={18} className="shrink-0 opacity-70" aria-hidden />
        ) : (
          <ChevronRight size={18} className="shrink-0 opacity-70" aria-hidden />
        )}
        <CircleHelp size={17} className="shrink-0 opacity-80" aria-hidden />
        <span>How to use this matrix</span>
      </button>
      {open ? (
        <div className="border-t border-black/10 px-3 pb-3.5 pt-4 text-sm leading-relaxed text-rm-ink/90 sm:px-4 sm:pb-4 sm:pt-5">
          <p className="mb-3 opacity-95">
            Capture risks in the top pool, then drag each item into the matrix
            cell that matches likelihood and impact.
          </p>
          <p className="mb-3">
            Add mitigation ideas under each categorized risk, then star key items
            to also list them in the Actions panel.
          </p>
          <p className="mb-3">
            Keep each line short and specific so your priority actions stay easy
            to review.
          </p>
          <p>
            <span className="font-medium text-rm-ink">Pool shortcut:</span> end a
            pool line with{" "}
            <code className="rounded bg-black/6 px-1 py-0.5 font-mono text-[13px]">
              impact / likelihood
            </code>{" "}
            (impact, slash, likelihood) to move that risk into the matching
            cell—e.g.{" "}
            <code className="rounded bg-black/6 px-1 py-0.5 font-mono text-[13px]">
              HI/HL
            </code>{" "}
            or{" "}
            <code className="rounded bg-black/6 px-1 py-0.5 font-mono text-[13px]">
              LI/LL
            </code>
            . Use short codes only—the token before the slash is impact (e.g.{" "}
            <span className="font-mono text-[13px]">HI</span>,{" "}
            <span className="font-mono text-[13px]">MI</span>,{" "}
            <span className="font-mono text-[13px]">LI</span>
            ), after the slash is likelihood (e.g.{" "}
            <span className="font-mono text-[13px]">HL</span>,{" "}
            <span className="font-mono text-[13px]">ML</span>,{" "}
            <span className="font-mono text-[13px]">LL</span>
            ). Alternate spellings like{" "}
            <span className="font-mono text-[13px]">IL</span> or{" "}
            <span className="font-mono text-[13px]">LH</span> work too.
          </p>
        </div>
      ) : null}
    </section>
  );
}
