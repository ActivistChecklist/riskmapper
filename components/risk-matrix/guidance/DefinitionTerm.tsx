"use client";

import React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { DEFINITIONS, type DefinitionKey } from "./guidanceCopy";

/**
 * A word with a dotted underline that opens its definition on click, tap or
 * Enter. Definitions never hold anything a step needs, so closing one loses
 * nothing.
 */
export default function DefinitionTerm({
  term,
  children,
}: {
  term: DefinitionKey;
  children: React.ReactNode;
}) {
  const def = DEFINITIONS[term];
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="cursor-help rounded-sm font-[inherit] text-inherit underline decoration-dotted decoration-[1.5px] underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-rm-ring"
        >
          {children}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[min(300px,calc(100vw-24px))] rounded-lg border border-rm-border-strong bg-rm-surface px-3 py-2.5 text-[13px] leading-snug text-rm-ink shadow-lg outline-none"
        >
          <p className="mb-0.5 font-semibold">{def.title}</p>
          <p>{def.body}</p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
