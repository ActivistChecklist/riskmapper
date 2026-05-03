"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  EyeOff,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RETENTION_DAYS } from "./cloudConfig";
import { buildShareUrl } from "./shareUrl";
import type { CloudMatrixHandle } from "./matrixCloudRepository";

export type ShareMatrixDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matrixTitle: string;
  /** Null while we're spinning up the cloud record. */
  handle: CloudMatrixHandle | null;
  loading: boolean;
  error: string | null;
  /** Triggered the first time the user opts in for this matrix. */
  onConfirmShare: () => void;
  /** "Stop sharing" — DELETE the cloud record + clear the cloud meta. */
  onStopSharing: () => void;
};

export default function ShareMatrixDialog({
  open,
  onOpenChange,
  matrixTitle,
  handle,
  loading,
  error,
  onConfirmShare,
  onStopSharing,
}: ShareMatrixDialogProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const displayTitle = matrixTitle.trim() || "Untitled";

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    if (!copyError) return;
    const t = setTimeout(() => setCopyError(false), 3000);
    return () => clearTimeout(t);
  }, [copyError]);

  useEffect(() => {
    if (!confirmingStop) return;
    const t = setTimeout(() => setConfirmingStop(false), 4000);
    return () => clearTimeout(t);
  }, [confirmingStop]);

  // buildShareUrl is async (libsodium constant-time base64 for the key),
  // so resolve it in an effect. Until it lands, the copy button is
  // effectively disabled — same UX as while `handle` is still null.
  const [shareUrl, setShareUrl] = useState("");
  useEffect(() => {
    if (!handle || typeof window === "undefined") {
      // Identity-driven reset on handle clear.
      /* eslint-disable react-hooks/set-state-in-effect */
      setShareUrl("");
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const url = await buildShareUrl({
          origin: window.location.origin,
          recordId: handle.recordId,
          key: handle.key,
        });
        if (cancelled) return;
        setShareUrl(url);
      } catch {
        if (cancelled) return;
        setShareUrl("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);
  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setCopyError(true);
    }
  };

  const handleStopSharing = () => {
    if (confirmingStop) {
      setConfirmingStop(false);
      onStopSharing();
    } else {
      setConfirmingStop(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{displayTitle}&rdquo; via link</DialogTitle>
          <DialogDescription className="text-sm text-rm-ink/80">
            Matrix contents are encrypted on this device before anything is uploaded.
            Only people with the full link can open the shared copy.
          </DialogDescription>
        </DialogHeader>

        <div
          className="mt-4 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-100"
          role="note"
          aria-label="Who can use this share link"
        >
          <AlertTriangle className="size-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-amber-950 dark:text-amber-100">Anyone with the full link can:</p>
            <ul className="mt-2 space-y-2">
              <li className="flex gap-2">
                <Pencil className="mt-0.5 size-4 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden />
                <span>Read and edit this matrix (same as you).</span>
              </li>
              <li className="flex gap-2">
                <Trash2 className="mt-0.5 size-4 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden />
                <span>
                  Remove the shared copy from the cloud — for example with Stop sharing
                  here, or by wiping the server copy — which affects everyone using the link.
                </span>
              </li>
            </ul>
            <p className="mt-3 flex gap-2 border-t border-amber-200/80 pt-3 text-amber-950/95 dark:border-amber-800/50 dark:text-amber-100/95">
              <EyeOff className="mt-0.5 size-4 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden />
              <span>
                There is <span className="font-semibold">no view-only</span> share link. The URL
                is a single password-like capability for full access.
              </span>
            </p>
          </div>
        </div>

        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-rm-ink/80">
          <li>The link expires after {RETENTION_DAYS} days of inactivity.</li>
          <li>Share it via a private channel.</li>
          <li>
            We cannot decrypt your matrix contents, but hosting still produces metadata
            (for example timing and access logs). See the project&rsquo;s threat model
            write-up for details.
          </li>
        </ul>

        {error ? (
          <div
            role="alert"
            className="mt-4 flex gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800/70 dark:bg-red-950/40 dark:text-red-200"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-300" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        {!handle ? (
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={onConfirmShare}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                    Encrypting…
                  </>
                ) : (
                  "Share to cloud"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-3">
            <label className="text-xs font-medium uppercase tracking-wide text-rm-ink/60">
              Share link
            </label>
            <div className="flex items-stretch gap-2">
              <input
                aria-label="Share link"
                aria-readonly="true"
                className="min-w-0 flex-1 rounded-md border border-rm-border-strong bg-rm-surface-hover cursor-default select-all px-3 py-2 font-mono text-xs"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                onClick={handleCopy}
                variant="outline"
                aria-label={copied ? "Copied to clipboard" : "Copy share link to clipboard"}
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="size-4" aria-hidden /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4" aria-hidden /> Copy
                  </>
                )}
              </Button>
            </div>
            {copyError ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                Copy failed — select the link above and copy manually.
              </p>
            ) : null}
            <div className="flex justify-end text-sm text-rm-ink/80">
              <a
                className="inline-flex items-center gap-1 underline underline-offset-2"
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open link <ExternalLink className="size-3" aria-hidden />
              </a>
            </div>
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-xs text-rm-ink/60">
                This revokes the link for everyone. Anyone currently viewing it
                will see an error on their next save.
              </p>
              <div className="flex justify-between gap-2">
                <Button
                  variant={confirmingStop ? "destructive" : "destructiveOutline"}
                  type="button"
                  onClick={handleStopSharing}
                >
                  {confirmingStop ? "Click again to confirm" : "Stop sharing"}
                </Button>
                <Button type="button" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
