"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RETENTION_DAYS } from "./cloudConfig";
import { buildShareUrl, shareKeyFingerprint } from "./shareUrl";
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

const TRUST_COPY =
  "Anyone with this link can read and edit this matrix. The link expires after " +
  `${RETENTION_DAYS} days of inactivity. We recommend sharing it via a private channel.`;

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

  const shareUrl =
    handle && typeof window !== "undefined"
      ? buildShareUrl({
          baseUrl: window.location.origin + window.location.pathname,
          recordId: handle.recordId,
          key: handle.key,
        })
      : "";
  const fingerprint = handle ? shareKeyFingerprint(handle.key) : "";

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
          <DialogDescription className="text-rm-ink/80">
            {TRUST_COPY}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
          >
            {error}
          </div>
        ) : null}

        {!handle ? (
          <div className="mt-5 flex flex-col gap-3">
            <p className="text-sm text-rm-ink/80">
              Saving this matrix to the cloud creates an encrypted copy on our
              server. The encryption key lives only in the URL fragment of the
              share link, so the server cannot read your data.
            </p>
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
                className="min-w-0 flex-1 rounded-md border border-black/15 bg-black/5 cursor-default select-all px-3 py-2 font-mono text-xs"
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
              <p role="alert" className="text-sm text-red-700">
                Copy failed — select the link above and copy manually.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-rm-ink/80">
              <span>
                Key fingerprint:{" "}
                <code className="rounded bg-black/5 px-1 py-0.5 font-mono">
                  …{fingerprint}
                </code>
                <span className="ml-1">
                  (verify the last 6 chars match after pasting)
                </span>
              </span>
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
