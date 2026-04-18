"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DeleteMatrixDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matrixTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeleteMatrixDialog({
  open,
  onOpenChange,
  matrixTitle,
  onCancel,
  onConfirm,
}: DeleteMatrixDialogProps) {
  const displayTitle = matrixTitle.trim() || "Untitled";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this matrix?</DialogTitle>
          <DialogDescription>
            &ldquo;{displayTitle}&rdquo; will be permanently removed from this browser.
            This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" type="button" onClick={onCancel}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
