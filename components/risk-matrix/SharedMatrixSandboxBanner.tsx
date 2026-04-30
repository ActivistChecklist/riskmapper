"use client";

import React from "react";
import { Eye, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SharedMatrixSandboxBannerProps = {
  matrixTitle: string;
  fingerprint: string;
  onSaveLocally: () => void;
  onDismiss: () => void;
  saving?: boolean;
};

/**
 * Visible banner shown when the user has opened an inbound shared link.
 * Opening a link does NOT silently merge into the library — the user must
 * explicitly accept it via "Save on this device".
 *
 * The fingerprint repeats the last 6 chars of the key so users sharing over
 * voice / phone can verify integrity.
 */
export default function SharedMatrixSandboxBanner({
  matrixTitle,
  fingerprint,
  onSaveLocally,
  onDismiss,
  saving,
}: SharedMatrixSandboxBannerProps) {
  const displayTitle = matrixTitle.trim() || "Untitled";
  return (
    <div
      role="region"
      aria-label="Shared matrix"
      className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-950"
    >
      <div className="flex items-center gap-2">
        <Eye className="size-4 shrink-0" aria-hidden />
        <div>
          <strong>Viewing shared matrix:</strong> &ldquo;{displayTitle}&rdquo;
          <span className="ml-2 text-xs text-sky-900/70">
            (key …
            <code className="rounded bg-white/60 px-1 py-0.5 font-mono">
              {fingerprint}
            </code>
            )
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onDismiss}
          disabled={saving}
          title="Close this preview without saving — you can re-open the original link later."
        >
          Dismiss (don&rsquo;t save)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="primary"
          onClick={onSaveLocally}
          disabled={saving}
        >
          <Save className="size-4" aria-hidden /> Save on this device
        </Button>
      </div>
    </div>
  );
}
