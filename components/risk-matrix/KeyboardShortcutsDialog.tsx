"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-6 min-w-[1.5rem] select-none items-center justify-center rounded border border-rm-border bg-rm-surface-2 px-1.5 font-mono text-[11px] font-medium text-rm-ink/90",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

type Row = { keys: React.ReactNode; label: string; detail?: string };

function ShortcutTable({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-3 text-sm">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex flex-col gap-1 border-b border-rm-divider pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
        >
          <div className="flex shrink-0 flex-wrap items-center gap-1">{row.keys}</div>
          <div className="min-w-0 flex-1 text-rm-ink/90">
            <p className="font-medium leading-snug">{row.label}</p>
            {row.detail ? (
              <p className="mt-0.5 text-xs leading-relaxed text-rm-ink/65">
                {row.detail}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function KeyboardShortcutsDialog({ open, onOpenChange }: Props) {
  const appRows: Row[] = [
    {
      keys: (
        <>
          <Kbd>⌘</Kbd>
          <span className="text-rm-ink/40">+</span>
          <Kbd>⇧</Kbd>
          <span className="text-rm-ink/40">+</span>
          <Kbd>C</Kbd>
          <span className="px-1 text-xs text-rm-ink/50">or</span>
          <Kbd>Ctrl</Kbd>
          <span className="text-rm-ink/40">+</span>
          <Kbd>⇧</Kbd>
          <span className="text-rm-ink/40">+</span>
          <Kbd>C</Kbd>
        </>
      ),
      label: "Copy full worksheet",
      detail: "Copies every section (pool, matrix, mitigations, actions) as plain text.",
    },
    {
      keys: (
        <>
          <Kbd>⌘</Kbd>
          <span className="text-rm-ink/40">+</span>
          <Kbd>/</Kbd>
          <span className="px-1 text-xs text-rm-ink/50">or</span>
          <Kbd>Ctrl</Kbd>
          <span className="text-rm-ink/40">+</span>
          <Kbd>/</Kbd>
        </>
      ),
      label: "Open this shortcuts list",
    },
  ];

  const editRows: Row[] = [
    {
      keys: <Kbd>Enter</Kbd>,
      label: "New line",
      detail:
        "In the risk pool, matrix, mitigations, or other actions — adds the next line. Use Shift+Enter inside a field when you need a line break in the same box.",
    },
    {
      keys: <Kbd>Backspace</Kbd>,
      label: "Merge with line above",
      detail:
        "At the start of a line, joins this line with the one above. You may be asked to confirm if the risk already has mitigations.",
    },
    {
      keys: (
        <>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
        </>
      ),
      label: "Move between fields",
      detail:
        "Moves between lines in a list. From the edges of the matrix, moves to neighboring cells or back to the pool. Between risks and mitigations, follows the main column order.",
    },
    {
      keys: <span className="text-xs font-medium text-rm-ink/80">Drag grip</span>,
      label: "Move a risk",
      detail: "Drag a risk line between the pool and matrix cells to recategorize it.",
    },
    {
      keys: <span className="text-xs font-medium text-rm-ink/80">Star</span>,
      label: "Toggle Actions list",
      detail:
        "On a mitigation or preparation line, stars add or remove that item from the Actions column.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts that work in this app. Copy commands work even while you are
            editing text.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-6">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rm-ink/55">
              App
            </h3>
            <ShortcutTable rows={appRows} />
          </section>
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rm-ink/55">
              Editing
            </h3>
            <ShortcutTable rows={editRows} />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
