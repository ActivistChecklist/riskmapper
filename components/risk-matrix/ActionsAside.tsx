"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Copy, Files, Star } from "lucide-react";
import ActionRow from "./ActionRow";
import OtherActionRow from "./OtherActionRow";
import { Button } from "@/components/ui/button";
import type { CellKey, GridLine, OtherAction, StarredAction } from "./types";
import { buildActionsClipboardPayload } from "./actionsClipboard";
import {
  formatAllMitigationsMarkdown,
  hasMitigationsMarkdownExport,
} from "./mitigationsMarkdown";

export type ActionsAsideProps = {
  grid: Record<CellKey, GridLine[]>;
  allActions: StarredAction[];
  otherActions: OtherAction[];
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
  onChangeOther: (id: string, text: string) => void;
  onRemoveOther: (id: string) => void;
  onAddOther: () => void;
  onOtherKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    action: OtherAction,
  ) => void;
  onOtherBlur: (
    e: React.FocusEvent<HTMLTextAreaElement>,
    action: OtherAction,
  ) => void;
};

export default function ActionsAside({
  grid,
  allActions,
  otherActions,
  onChangeSub,
  onToggleStar,
  onChangeOther,
  onRemoveOther,
  onAddOther,
  onOtherKeyDown,
  onOtherBlur,
}: ActionsAsideProps) {
  const [copyNotice, setCopyNotice] = useState<"idle" | "actions" | "mitigations">(
    "idle",
  );

  const totalCount = allActions.length + otherActions.length;

  const hasCopyableText = useMemo(() => {
    const starredOk = allActions.some(
      (a) => a.subLine.text.trim().length > 0,
    );
    const otherOk = otherActions.some((o) => o.text.trim().length > 0);
    return starredOk || otherOk;
  }, [allActions, otherActions]);

  const hasMitigationsExport = useMemo(
    () => hasMitigationsMarkdownExport(grid),
    [grid],
  );

  const scheduleCopyNoticeReset = useCallback(() => {
    window.setTimeout(() => setCopyNotice("idle"), 2000);
  }, []);

  const handleCopyActions = useCallback(async () => {
    if (!hasCopyableText) return;
    const { plain, html } = buildActionsClipboardPayload(
      allActions,
      otherActions,
    );
    if (!plain.trim()) return;
    const markCopied = () => {
      setCopyNotice("actions");
      scheduleCopyNoticeReset();
    };
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([plain], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
        markCopied();
        return;
      }
    } catch {
      // fall through to plain text
    }
    try {
      await navigator.clipboard.writeText(plain);
      markCopied();
    } catch {
      // clipboard API unavailable or denied
    }
  }, [
    allActions,
    otherActions,
    hasCopyableText,
    scheduleCopyNoticeReset,
  ]);

  const handleCopyMitigations = useCallback(async () => {
    if (!hasMitigationsExport) return;
    const md = formatAllMitigationsMarkdown(grid);
    if (!md.trim()) return;
    try {
      await navigator.clipboard.writeText(md);
      setCopyNotice("mitigations");
      scheduleCopyNoticeReset();
    } catch {
      // clipboard API unavailable or denied
    }
  }, [grid, hasMitigationsExport, scheduleCopyNoticeReset]);

  const addOtherActionControl = (
    <div className="mt-1.5 flex justify-stretch sm:justify-start">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full sm:w-auto"
        onClick={onAddOther}
      >
        Add other action
      </Button>
    </div>
  );

  const listBody =
    allActions.length > 0 || otherActions.length > 0 ? (
      <div className="min-h-0 bg-white px-2 pb-1.5 pt-2">
        {allActions.map((action) => (
          <ActionRow
            key={`${action.cellKey}-${action.parentLineId}-${action.subType}-${action.subLine.id}`}
            action={action}
            onChange={onChangeSub}
            onToggleStar={onToggleStar}
          />
        ))}
        {otherActions.map((action) => (
          <OtherActionRow
            key={action.id}
            action={action}
            onChange={onChangeOther}
            onRemove={onRemoveOther}
            onKeyDown={onOtherKeyDown}
            onBlur={onOtherBlur}
          />
        ))}
        {addOtherActionControl}
      </div>
    ) : (
      <div className="flex min-h-[12.5rem] flex-col bg-white px-3 pb-2 pt-2.5 sm:min-h-[14rem]">
        <div
          className="flex min-h-[10.5rem] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300/90 bg-zinc-50/70 px-4 py-8 sm:min-h-[11.5rem]"
          aria-label="Placeholder: starred mitigations and preparations also list here."
        >
          <p className="max-w-[17rem] text-center text-[13px] leading-snug font-normal italic text-zinc-400 sm:text-sm sm:leading-relaxed">
            Star a mitigation or preparation item to also show it here as a
            prioritized action, or use{" "}
            <span className="font-medium not-italic text-zinc-500">
              Add other action
            </span>{" "}
            below for anything else.
          </p>
        </div>
        {addOtherActionControl}
      </div>
    );

  const footer = (
    <div className="border-t border-black/10 bg-zinc-50/80 px-3 py-3 sm:px-4 sm:py-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <Button
          type="button"
          variant="primary"
          size="lg"
          className="min-h-12 w-full min-w-0 flex-1 sm:w-auto"
          disabled={!hasCopyableText}
          onClick={handleCopyActions}
        >
          <Copy size={18} strokeWidth={2} aria-hidden />
          {copyNotice === "actions" ? "Copied" : "Copy actions"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-12 w-full min-w-0 flex-1 sm:w-auto"
          disabled={!hasMitigationsExport}
          onClick={handleCopyMitigations}
        >
          <Files size={18} strokeWidth={2} aria-hidden />
          {copyNotice === "mitigations" ? "Copied" : "Copy all mitigations"}
        </Button>
      </div>
    </div>
  );

  return (
    <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
      <div className="flex flex-col overflow-hidden rounded-md border border-black/10 bg-white">
        <div className="flex shrink-0 items-center gap-1.5 border-b border-black/10 bg-rm-actions px-3 py-2 text-rm-actions-fg">
          <Star size={13} fill="currentColor" strokeWidth={1.5} />
          <span className="text-xs font-semibold uppercase tracking-wide sm:text-sm">
            Actions
          </span>
          <span className="ml-0.5 text-xs opacity-90 sm:text-sm">
            ({totalCount})
          </span>
        </div>
        {listBody}
        {footer}
      </div>
    </aside>
  );
}
