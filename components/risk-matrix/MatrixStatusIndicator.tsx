"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  CircleCheck,
  CloudOff,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SyncState } from "./CloudSyncIndicator";

/**
 * Single status pill shown next to the matrix title. Replaces the
 * separate "Saved locally" button (toolbar) and CloudSyncIndicator
 * (toolbar) — both states render through this component for visual
 * consistency.
 *
 * Local-only matrices show "Saved locally"; the pill is clickable and
 * opens the user's saved-matrices list. Shared matrices show their live
 * sync state (idle/syncing/offline/etc) and only become clickable when
 * there's a terminal failure (rollback / missing / error) the user can
 * action.
 */

export type MatrixStatusIndicatorProps = {
  /** True iff the active matrix has cloud sync enabled. */
  shared: boolean;
  /** Sync state when `shared`; ignored otherwise. */
  syncState: SyncState;
  /** Surface a terminal-state action (re-open error dialog, etc). */
  onIndicatorAction?: () => void;
  className?: string;
};

const ACTIONABLE_SHARED_STATES = new Set(["rollback", "missing", "error"]);

const PILL_CLASS = cn(
  "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap",
);

export default function MatrixStatusIndicator({
  shared,
  syncState,
  onIndicatorAction,
  className,
}: MatrixStatusIndicatorProps) {
  const [infoOpen, setInfoOpen] = useState(false);

  if (!shared) {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setInfoOpen(true)}
          aria-label="Saved locally on this device"
          title="This matrix is saved on this device. Click for details."
          className={cn(
            PILL_CLASS,
            "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
            className,
          )}
        >
          <CircleCheck className="size-3.5 text-emerald-600" aria-hidden />
          <span>Saved locally</span>
        </Button>
        <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Saved on your device</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3 pt-1 text-sm leading-relaxed text-rm-ink opacity-90">
                  <p>
                    Nothing you type here is sent over the internet or stored on
                    our servers or in the cloud. Your risks, notes, and saved
                    matrices stay in this browser on this computer, like notes
                    in a notebook that never leave your desk.
                  </p>
                  <p>
                    If you clear this site&apos;s data in your browser, the data
                    will be deleted.
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => setInfoOpen(false)}>
                Got it
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const meta = describeSyncState(syncState);
  const actionable = ACTIONABLE_SHARED_STATES.has(syncState.kind);

  if (actionable && onIndicatorAction) {
    return (
      <button
        type="button"
        onClick={onIndicatorAction}
        aria-label={meta.title}
        title={meta.title}
        className={cn(
          PILL_CLASS,
          meta.tone,
          "hover:brightness-95 focus-visible:ring-2 focus-visible:ring-black/20",
          className,
        )}
      >
        <span aria-hidden className="grid place-items-center">
          {meta.icon}
        </span>
        <span>{meta.label}</span>
      </button>
    );
  }

  return (
    <div
      role="status"
      aria-label={meta.title}
      title={meta.title}
      className={cn(PILL_CLASS, meta.tone, className)}
    >
      <span aria-hidden className="grid place-items-center">
        {meta.icon}
      </span>
      <span>{meta.label}</span>
    </div>
  );
}

type Display = {
  label: string;
  title: string;
  tone: string;
  icon: React.ReactNode;
};

function describeSyncState(state: SyncState): Display {
  switch (state.kind) {
    case "idle":
      return {
        label: "Synced",
        title: "All edits saved to the cloud.",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
        icon: <CircleCheck className="size-3.5 text-emerald-600" />,
      };
    case "loading":
      return {
        label: "Loading…",
        title: "Fetching latest state.",
        tone: "border-sky-200 bg-sky-50 text-sky-900",
        icon: <RefreshCw className="size-3.5" />,
      };
    case "syncing":
      return {
        label: "Syncing…",
        title: "Encrypting and uploading.",
        tone: "border-sky-200 bg-sky-50 text-sky-900",
        icon: <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />,
      };
    case "offline":
      return {
        label: `Offline — retry ${state.attempt}`,
        title: state.message,
        tone: "border-amber-300 bg-amber-50 text-amber-900",
        icon: <CloudOff className="size-3.5" />,
      };
    case "rollback":
      return {
        label: "Rollback detected",
        title: state.message,
        tone: "border-red-300 bg-red-50 text-red-900",
        icon: <ShieldAlert className="size-3.5" />,
      };
    case "missing":
      return {
        label: "Link expired",
        title: "This shared matrix is no longer available on the server.",
        tone: "border-red-300 bg-red-50 text-red-900",
        icon: <CloudOff className="size-3.5" />,
      };
    case "error":
      return {
        label: "Sync error",
        title: state.message,
        tone: "border-red-300 bg-red-50 text-red-900",
        icon: <AlertTriangle className="size-3.5" />,
      };
  }
}
