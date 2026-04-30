"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CloudConflictDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matrixTitle: string;
  /** Discard local edits since opening; reload the remote version. */
  onReloadRemote: () => void;
  /** Push local edits, overwriting the remote version. */
  onKeepMine: () => void;
};

/**
 * Non-destructive conflict dialog. The safer action ("Reload remote") is
 * autoFocused AND placed first in DOM order so a Tab-away from focus
 * lands on the destructive option only after an intentional tab. We use
 * `flex-row-reverse` to keep the visual layout with "Keep mine" on the
 * left and "Reload remote" on the right.
 */
export default function CloudConflictDialog({
  open,
  onOpenChange,
  matrixTitle,
  onReloadRemote,
  onKeepMine,
}: CloudConflictDialogProps) {
  const displayTitle = matrixTitle.trim() || "Untitled";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-600" aria-hidden />
            Sync conflict on &ldquo;{displayTitle}&rdquo;
          </DialogTitle>
          <DialogDescription className="text-rm-ink/80">
            Another device edited this matrix recently. Choose how to resolve
            the conflict.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-2">
          <Button type="button" variant="primary" onClick={onReloadRemote} autoFocus>
            Reload remote
          </Button>
          <Button type="button" variant="outline" onClick={onKeepMine}>
            Keep my edits (overwrite theirs)
          </Button>
        </div>
        <p className="mt-3 text-xs text-rm-ink/60">
          Your unsaved edits will be uploaded and the other device&rsquo;s
          changes will be discarded.
        </p>
      </DialogContent>
    </Dialog>
  );
}
