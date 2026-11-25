"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ExampleActionGroups,
  ExampleMatrix,
  ExampleResourceList,
  ExampleTiers,
} from "./examples";
import { RuckusLink } from "./RuckusCredit";
import { EXAMPLE_CELLS, EXAMPLE_PLAN, EXAMPLE_PLAN_TITLE } from "./guidanceCopy";

/**
 * The worksheet's example plan, finished, in the app's order: the risks on
 * the matrix, the group's resources, the plan as step 4's cards, then the
 * starred items as the Actions panel lists them.
 */
export default function ExamplePlanDialog({
  open,
  onOpenChange,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it, which gets focus back however it closes. */
  returnFocusTo: React.RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl p-0"
        onCloseAutoFocus={(e) => {
          const opener = returnFocusTo.current;
          if (opener?.isConnected) {
            e.preventDefault();
            opener.focus();
          }
        }}
      >
        <DialogHeader className="border-b border-rm-border px-5 pb-3 pt-4 pr-10">
          <DialogTitle>{EXAMPLE_PLAN_TITLE}</DialogTitle>
          <DialogDescription className="opacity-100 text-rm-muted">
            Adapted with permission from <RuckusLink />
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 pb-5 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-rm-ink">On the matrix</h3>
          <ExampleMatrix cells={EXAMPLE_CELLS} />
          <h3 className="mb-2 mt-5 text-sm font-semibold text-rm-ink">Resources</h3>
          <ExampleResourceList />
          <h3 className="mb-1 mt-5 text-sm font-semibold text-rm-ink">The plan</h3>
          <div className="-mx-3 rounded-md bg-rm-well">
            <ExampleTiers risks={EXAMPLE_PLAN} />
          </div>
          <h3 className="mb-2 mt-5 text-sm font-semibold text-rm-ink">Actions</h3>
          <div className="-mx-3 rounded-md bg-rm-well px-3 py-3">
            <ExampleActionGroups risks={EXAMPLE_PLAN} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
