"use client";

import React, { useCallback, useState } from "react";
import { Copy, Star } from "lucide-react";
import ActionRow from "./ActionRow";
import { Button } from "@/components/ui/button";
import type { CellKey, StarredAction } from "./types";

function formatActionsForClipboard(actions: StarredAction[]): string {
  if (actions.length === 0) return "";
  return actions
    .map((a, i) => {
      const kind = a.subType === "reduce" ? "Reduction for" : "Preparation for";
      const risk = a.parentText.trim() || "Untitled risk";
      const body = a.subLine.text.trim() || "(empty)";
      return `${i + 1}. ${body}\n   ${kind} ${risk}`;
    })
    .join("\n\n");
}

export type ActionsAsideProps = {
  allActions: StarredAction[];
  onChangeSub: (
    cellKey: CellKey,
    parentLineId: string,
    subType: "reduce" | "prepare",
    subId: string,
    text: string,
  ) => void;
  onToggleStar: (
    cellKey: CellKey,
    parentLineId: string,
    subType: "reduce" | "prepare",
    subId: string,
  ) => void;
};

export default function ActionsAside({
  allActions,
  onChangeSub,
  onToggleStar,
}: ActionsAsideProps) {
  const [copyLabel, setCopyLabel] = useState<"idle" | "copied">("idle");

  const handleCopyActions = useCallback(async () => {
    if (allActions.length === 0) return;
    const text = formatActionsForClipboard(allActions);
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel("copied");
      window.setTimeout(() => setCopyLabel("idle"), 2000);
    } catch {
      // clipboard API unavailable or denied
    }
  }, [allActions]);

  const copyFooter = (
    <div className="border-t border-black/10 bg-zinc-50/80 px-3 py-3 sm:px-4 sm:py-3.5">
      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={allActions.length === 0}
        onClick={handleCopyActions}
      >
        <Copy size={18} strokeWidth={2} aria-hidden />
        {copyLabel === "copied" ? "Copied" : "Copy actions"}
      </Button>
    </div>
  );

  return (
    <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
      {allActions.length > 0 ? (
        <div className="flex flex-col overflow-hidden rounded-md border border-black/10 bg-white">
          <div className="flex shrink-0 items-center gap-1.5 border-b border-black/10 bg-rm-actions px-3 py-2 text-rm-actions-fg">
            <Star size={13} fill="currentColor" strokeWidth={1.5} />
            <span className="text-xs font-semibold uppercase tracking-wide sm:text-sm">
              Actions
            </span>
            <span className="ml-0.5 text-xs opacity-90 sm:text-sm">
              ({allActions.length})
            </span>
          </div>
          <div className="min-h-0 bg-white px-2 py-2">
            {allActions.map((action) => (
              <ActionRow
                key={`${action.cellKey}-${action.parentLineId}-${action.subType}-${action.subLine.id}`}
                action={action}
                onChange={onChangeSub}
                onToggleStar={onToggleStar}
              />
            ))}
          </div>
          {copyFooter}
        </div>
      ) : (
        <div className="flex flex-col overflow-hidden rounded-md border border-black/10 bg-white">
          <div className="flex shrink-0 items-center gap-1.5 border-b border-black/10 bg-rm-actions px-3 py-2 text-rm-actions-fg">
            <Star size={13} fill="currentColor" strokeWidth={1.5} />
            <span className="text-xs font-semibold uppercase tracking-wide sm:text-sm">
              Actions
            </span>
            <span className="ml-0.5 text-xs opacity-90 sm:text-sm">(0)</span>
          </div>
          <div className="flex min-h-[12.5rem] flex-col bg-white px-3 pb-2 pt-2.5 sm:min-h-[14rem]">
            <div
              className="flex min-h-[10.5rem] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300/90 bg-zinc-50/70 px-4 py-8 sm:min-h-[11.5rem]"
              aria-label="Placeholder: starred mitigations and preparations also list here."
            >
              <p className="max-w-[17rem] text-center text-[13px] leading-snug font-normal italic text-zinc-400 sm:text-sm sm:leading-relaxed">
                Star a mitigation or preparation item to also show it here as a
                prioritized action.
              </p>
            </div>
          </div>
          {copyFooter}
        </div>
      )}
    </aside>
  );
}
