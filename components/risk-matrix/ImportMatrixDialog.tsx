"use client";

import React from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MatrixImportSummary } from "./matrixFile";

export type ImportMatrixDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The title the matrix will be saved under. */
  title: string;
  /** True when the title was changed to avoid matching an existing matrix. */
  renamed: boolean;
  summary: MatrixImportSummary | null;
  onConfirm: () => void;
};

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/**
 * Confirmation before an imported file touches storage. A file can come from
 * anyone, so the person sees what it holds, and is reminded that its advice
 * is someone else's, before it joins their library.
 */
export default function ImportMatrixDialog({
  open,
  onOpenChange,
  title,
  renamed,
  summary,
  onConfirm,
}: ImportMatrixDialogProps) {
  const contents = summary
    ? [
        plural(summary.risks, "risk on the matrix", "risks on the matrix"),
        summary.unplacedRisks > 0
          ? plural(summary.unplacedRisks, "unplaced risk", "unplaced risks")
          : null,
        `${plural(summary.mitigations, "mitigation", "mitigations")}, ${summary.starred.toLocaleString("en-US")} starred`,
        summary.otherActions > 0
          ? plural(summary.otherActions, "other action", "other actions")
          : null,
        summary.hasNotes ? "Notes" : null,
      ].filter((x): x is string => x !== null)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import this matrix?</DialogTitle>
          <DialogDescription>
            It will be saved in this browser as a new matrix, and your current
            matrix is kept. Nothing is uploaded.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3 text-sm text-rm-ink">
          <div>
            <p className="font-medium break-words">&ldquo;{title}&rdquo;</p>
            {renamed ? (
              <p className="text-xs text-rm-muted">
                Renamed because you already have a matrix with this name.
              </p>
            ) : null}
          </div>
          <ul className="list-disc space-y-0.5 pl-5">
            {contents.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {summary && summary.links > 0 ? (
            <p className="flex gap-2 rounded-md bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                Contains {plural(summary.links, "web link", "web links")}. Check
                where a link goes before you open it.
              </span>
            </p>
          ) : null}
          <p className="text-rm-muted">
            Everything in it was written by whoever made the file. Read its
            risks and starred actions before relying on them.
          </p>
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={onConfirm}>
            Import
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
