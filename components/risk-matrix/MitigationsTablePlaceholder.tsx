"use client";

import React from "react";
import { cn } from "@/lib/utils";
import EmptySlot from "./EmptySlot";

type Props = {
  embeddedInStepSection?: boolean;
  /** A control under the text, such as the guidance's Show examples. */
  action?: React.ReactNode;
  /**
   * Under step 4's example: a short slot that follows the example box
   * instead of a tall placeholder of its own.
   */
  afterExample?: boolean;
};

/**
 * Shown before any risk is placed on the matrix: a dashed body explains what
 * will appear here.
 */
export default function MitigationsTablePlaceholder({
  embeddedInStepSection = false,
  action,
  afterExample = false,
}: Props) {
  const text = (
    <>
      Drag a risk from the pool into a cell in the risk matrix table above.
      Your risks will show up here.
    </>
  );
  if (afterExample) {
    // The example above already has the gray body and its padding, so this
    // continues it and closes the step's rounded bottom.
    return (
      <div className="min-w-0 rounded-b-md bg-rm-well px-3 pb-3">
        <EmptySlot action={action}>{text}</EmptySlot>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "min-w-0 bg-rm-well",
        embeddedInStepSection
          ? "mb-0 rounded-t-none rounded-b-md border border-x-0 border-b border-rm-border border-t border-rm-border"
          : "mb-3.5 rounded-md border border-rm-border",
      )}
    >
      <div className="flex min-h-[12.5rem] flex-col bg-rm-well px-3 pb-3 pt-2.5 sm:min-h-[14rem]">
        <EmptySlot
          action={action}
          className="min-h-[10.5rem] flex-1 py-8 sm:min-h-[11.5rem]"
        >
          {text}
        </EmptySlot>
      </div>
    </div>
  );
}
