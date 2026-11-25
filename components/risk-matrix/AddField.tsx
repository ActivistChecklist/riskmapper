"use client";

import React, { forwardRef, useState } from "react";
import AutoTextarea from "./AutoTextarea";
import { splitPastedLines } from "./pasteLines";
import { Button } from "@/components/ui/button";

export type AddFieldProps = {
  /** Accessible name of the field, such as "Add a risk". */
  label: string;
  placeholder: string;
  /** Adds the entries. Pasting several lines adds one per line. */
  onAdd: (texts: string[]) => void;
};

/**
 * The bordered box and Add button under a brainstorm list. What is typed
 * here is not part of the matrix until it is added, so nothing half-typed
 * is saved, shared or exported.
 */
const AddField = forwardRef<HTMLTextAreaElement, AddFieldProps>(function AddField(
  { label, placeholder, onAdd },
  ref,
) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd([text]);
    setDraft("");
  };

  return (
    <div className="mt-2 flex w-full max-w-[46ch] items-start gap-2">
      <div className="min-w-0 flex-1 rounded-md border border-rm-border-strong bg-rm-surface transition-[border-color,box-shadow] focus-within:border-rm-primary focus-within:ring-2 focus-within:ring-rm-primary/20">
        <AutoTextarea
          ref={ref}
          value={draft}
          ariaLabel={label}
          placeholder={placeholder}
          // `block` drops the baseline gap an inline textarea leaves under
          // itself. The left padding puts typed text where it lands once
          // added: past a list row's grip column (18px, or 22px plus a 2px
          // gap from sm) and its 6px text inset (none below sm).
          className="block pr-1.5 pl-[18px] placeholder:text-rm-muted-2 sm:pl-[30px]"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
          onPaste={(e) => {
            const el = e.currentTarget;
            const split = splitPastedLines(
              el.value,
              el.selectionStart ?? 0,
              el.selectionEnd ?? 0,
              e.clipboardData.getData("text/plain"),
            );
            if (!split) return;
            e.preventDefault();
            e.stopPropagation();
            onAdd(split.texts);
            setDraft("");
          }}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-[37px] shrink-0 px-3"
        onClick={() => {
          add();
          if (ref && typeof ref !== "function") ref.current?.focus();
        }}
      >
        Add
      </Button>
    </div>
  );
});

export default AddField;
