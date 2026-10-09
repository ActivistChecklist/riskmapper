"use client";

import React from "react";
import { Download, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type MatrixFileDownloadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The name the file will be saved under. */
  filename: string;
  onDownload: () => void;
  /**
   * Where focus goes when the dialog closes. It is opened from a menu item
   * that no longer exists by then, so Radix would otherwise drop focus on
   * the page body.
   */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
};

/**
 * Shown before a matrix file is saved. Unlike a share link, the file is
 * plaintext, and its whole purpose is to be passed around, so this is the
 * one moment to explain how to send and keep it.
 */
export default function MatrixFileDownloadDialog({
  open,
  onOpenChange,
  filename,
  onDownload,
  returnFocusTo,
}: MatrixFileDownloadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          if (!returnFocusTo?.current) return;
          e.preventDefault();
          returnFocusTo.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Download matrix file</DialogTitle>
          <DialogDescription>
            Export the current Risk Matrix data so you can re-import it or send
            it to someone else to import to RiskMapper.app. This has a similar
            effect to using our end-to-end encrypted &ldquo;share&rdquo;
            feature, but you never have to send any data to our servers even in
            an encrypted way.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3 text-sm text-rm-ink">
          <p className="flex gap-2 rounded-md bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <LockOpen size={16} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              <strong className="font-semibold">This file is not encrypted.</strong>{" "}
              Anyone who gets a copy, or gets into a device it is saved on, can
              read every risk, action and note in it.
            </span>
          </p>
          <div>
            <h3 className="font-semibold">Sending it</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                Use an end-to-end encrypted app like Signal, and turn on
                disappearing messages in that chat.
              </li>
              <li>
                Avoid email, text messages, Slack, Discord and cloud drives like
                Google Drive or Dropbox. The companies running them can read
                what you send, and can be made to hand it over.
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">Storing it</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                Keep it only on a device with a strong passcode and encryption
                turned on.
              </li>
              <li>
                Once it has been imported, delete it from your downloads and from
                the chat.
              </li>
            </ul>
          </div>
          <p className="text-rm-muted">
            It will be saved as{" "}
            <span className="break-all font-medium text-rm-ink">{filename}</span>
            . The name includes your matrix title, so anyone who sees your
            files can see it.
          </p>
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={onDownload}>
            <Download size={16} aria-hidden />
            Download file
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
