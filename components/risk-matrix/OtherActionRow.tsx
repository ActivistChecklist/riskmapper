"use client";

import React from "react";
import AutoTextarea from "./AutoTextarea";
import type { OtherAction } from "./types";

export type OtherActionRowProps = {
  action: OtherAction;
  onChange: (id: string, text: string) => void;
  onKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    action: OtherAction,
  ) => void;
  onBlur: (e: React.FocusEvent<HTMLTextAreaElement>, action: OtherAction) => void;
};

export default function OtherActionRow({
  action,
  onChange,
  onKeyDown,
  onBlur,
}: OtherActionRowProps) {
  return (
    <div className="mb-1 mt-1.5 flex items-start gap-1 rounded-[5px] border border-black/12 bg-zinc-50/90 pb-1 pt-1.5 pr-2 pl-2">
      <span
        aria-hidden
        className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center"
      />
      <div className="min-w-0 flex-1">
        <AutoTextarea
          lineId={action.id}
          value={action.text}
          onChange={(e) => onChange(action.id, e.target.value)}
          onKeyDown={(e) => onKeyDown(e, action)}
          onBlur={(e) => onBlur(e, action)}
          placeholder="Other action…"
          className="px-1.5 pb-0 pt-0.5 text-[15px] font-semibold"
        />
      </div>
    </div>
  );
}
