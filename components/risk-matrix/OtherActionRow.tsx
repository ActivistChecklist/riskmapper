"use client";

import React from "react";
import LineShell from "./LineShell";
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
    <LineShell
      className="my-0.5 border-transparent bg-transparent"
      // Empty spacer the width of ActionRow's star, so other actions'
      // text lines up with starred ones.
      leftAffordance={<span aria-hidden className="w-[24px] shrink-0" />}
      textareaProps={{
        lineId: action.id,
        value: action.text,
        onChange: (e) => onChange(action.id, e.target.value),
        onKeyDown: (e) => onKeyDown(e, action),
        onBlur: (e) => onBlur(e, action),
        placeholder: "Other action…",
        className: "py-1 pl-1.5 pr-1.5",
      }}
    />
  );
}
