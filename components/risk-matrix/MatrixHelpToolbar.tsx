"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function MatrixHelpToolbar() {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h1 className="text-xs font-semibold uppercase tracking-[0.15em] opacity-85 sm:text-sm">
        risk matrix
      </h1>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            Help
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How to use this matrix</DialogTitle>
            <DialogDescription>
              Capture risks in the top pool, then drag each item into the matrix
              cell that matches likelihood and impact.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 space-y-2 text-sm opacity-90">
            <p>
              Add mitigation ideas under each categorized risk, then star key
              items to also list them in the Actions panel.
            </p>
            <p>
              Keep each line short and specific so your priority actions stay easy
              to review.
            </p>
            <p>
              <span className="font-medium text-rm-ink">Pool shortcut:</span> end a
              pool line with{" "}
              <code className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[13px]">
                impact / likelihood
              </code>{" "}
              (impact, slash, likelihood) to move that risk into the matching cell—e.g.{" "}
              <code className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[13px]">
                HI/HL
              </code>{" "}
              or{" "}
              <code className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[13px]">
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
