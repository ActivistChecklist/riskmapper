"use client";

import React, { useMemo } from "react";
import { Copy, Star } from "lucide-react";
import ActionRow from "./ActionRow";
import OtherActionRow from "./OtherActionRow";
import { STEP_SECTION_ACTION_BUTTON_CLASS } from "./constants";
import { copyStarredActions } from "./matrixClipboard";
import { Button } from "@/components/ui/button";
import type { CellKey, OtherAction, StarredAction } from "./types";

export type ActionsAsideProps = {
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
  allActions,
  otherActions,
  onChangeSub,
  onToggleStar,
  onChangeOther,
  onAddOther,
  onOtherKeyDown,
  onOtherBlur,
}: ActionsAsideProps) {
  const totalCount = allActions.length + otherActions.length;

  const hasCopyableText = useMemo(() => {
    const starredOk = allActions.some(
      (a) => a.subLine.text.trim().length > 0,
    );
    const otherOk = otherActions.some((o) => o.text.trim().length > 0);
    return starredOk || otherOk;
  }, [allActions, otherActions]);

  const handleCopyActions = () => {
    void copyStarredActions(allActions, otherActions);
  };

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
      <div className="min-h-0 bg-rm-surface px-2 pb-1.5 pt-2">
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
            onKeyDown={onOtherKeyDown}
            onBlur={onOtherBlur}
          />
        ))}
        {addOtherActionControl}
      </div>
    ) : (
      <div className="flex min-h-[12.5rem] flex-col bg-rm-surface px-3 pb-2 pt-2.5 sm:min-h-[14rem]">
        <div
          className="flex min-h-[10.5rem] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-rm-border-strong bg-rm-surface-2 px-4 py-8 sm:min-h-[11.5rem]"
          aria-label="Placeholder: starred mitigations and preparations also list here."
        >
          <p className="max-w-[17rem] text-center text-[13px] leading-snug font-normal italic text-rm-muted-2 sm:text-sm sm:leading-relaxed">
            Star a mitigation or preparation item to also show it here as a
            prioritized action, or use{" "}
            <span className="font-medium not-italic text-rm-muted">
              Add other action
            </span>{" "}
            below for anything else.
          </p>
        </div>
        {addOtherActionControl}
      </div>
    );

  // The sticky behaviour at xl+ is owned by the parent wrapper in
  // RiskMatrix (which pins ActionsAside + NotesEditor together).
  // ActionsAside itself just lays out normally.
  return (
    <aside className="min-w-0">
      <div className="flex flex-col overflow-hidden rounded-md border border-rm-border bg-rm-surface">
        <div className="flex shrink-0 items-center gap-1.5 border-b border-white/25 bg-rm-primary px-2 py-2 text-rm-primary-fg sm:px-3">
          <Star size={13} fill="currentColor" strokeWidth={1.5} />
          <span className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide sm:text-sm">
            Actions
          </span>
          <span className="text-xs opacity-90 sm:text-sm">({totalCount})</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={[
              "h-8 shrink-0 gap-1 px-2",
              STEP_SECTION_ACTION_BUTTON_CLASS,
            ].join(" ")}
            disabled={!hasCopyableText}
            onClick={handleCopyActions}
            aria-label="Copy actions"
          >
            <Copy size={16} strokeWidth={2} aria-hidden />
            <span className="hidden sm:inline">Copy</span>
          </Button>
        </div>
        {listBody}
      </div>
    </aside>
  );
}
