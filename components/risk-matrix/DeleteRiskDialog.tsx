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

export type DeleteRiskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeleteRiskDialog({
  open,
  onOpenChange,
  onCancel,
  onConfirm,
}: DeleteRiskDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this risk?</DialogTitle>
          <DialogDescription>
            This risk has mitigation or preparation notes. Deleting it will merge
            it into the previous risk line.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={onConfirm}>Delete risk</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
