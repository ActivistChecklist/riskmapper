"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  CircleCheck,
  CloudOff,
  Loader2,
  LockKeyhole,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SyncState } from "./CloudSyncIndicator";

/**
 * Single status pill shown next to the matrix title. Replaces the
 * separate "Saved locally" button (toolbar) and CloudSyncIndicator
 * (toolbar) — both states render through this component for visual
 * consistency.
 *
 * Local-only matrices show "Saved locally". Shared matrices show their
 * live sync state (idle/syncing/offline/etc).
 *
 * Three kinds of pill come out of that:
 *
 *   - Settled ("Saved locally", "End-to-end encrypted") opens an explainer
 *     for the claim it is making, which ends at the security page.
 *   - Terminal failure (rollback / missing / error) is a button that hands
 *     off to `onIndicatorAction`.
 *   - Everything mid-flight is a plain `role="status"` with no action.
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

/** Interactive pills get the same affordance whichever branch renders them. */
const CLICKABLE_PILL_CLASS =
  "hover:brightness-95 dark:hover:brightness-110 focus-visible:ring-2 focus-visible:ring-rm-ring";

/**
 * Both explainers end here. The claims they make in two sentences are the
 * ones the security page makes in full, so the pill is the entry point to it
 * rather than a dead end. Plain anchor and canonical trailing slash: it is its
 * own static document, see MIGRATION.md D2 and D7.
 */
function SecurityPageLink() {
  return (
    <p className="pt-1">
      <a
        href="/security/"
        className="font-medium text-rm-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rm-ring"
      >
        How Risk Mapper protects your data
      </a>
    </p>
  );
}

/** The shell both pills share: title, prose, security link, dismiss. */
function StatusInfoDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1 text-sm leading-relaxed text-rm-ink opacity-90">
              {children}
              <SecurityPageLink />
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setInfoOpen(true)}
              aria-label="Saved locally on this device"
              className={cn(
                PILL_CLASS,
                "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/40",
                className,
              )}
            >
              <CircleCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              {/* Label collapses to icon-only below lg so the title row
                  keeps the right cluster on a single line on narrower
                  screens. */}
              <span className="hidden lg:inline">Saved locally</span>
            </Button>
          </TooltipTrigger>
          {/* Tooltip only renders at widths where the label is hidden. */}
          <TooltipContent side="bottom" className="lg:hidden">
            Saved locally
          </TooltipContent>
        </Tooltip>
        <StatusInfoDialog
          open={infoOpen}
          onOpenChange={setInfoOpen}
          title="Saved on your device"
        >
          <p>
            Nothing you type here is sent over the internet or stored on our
            servers or in the cloud. Your risks, notes, and saved matrices stay
            in this browser on this computer, like notes in a notebook that
            never leave your desk.
          </p>
          <p>
            If you clear this site&apos;s data in your browser, the data will be
            deleted.
          </p>
        </StatusInfoDialog>
      </>
    );
  }

  const meta = describeSyncState(syncState);
  const actionable = ACTIONABLE_SHARED_STATES.has(syncState.kind);

  if (actionable && onIndicatorAction) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onIndicatorAction}
            aria-label={meta.title}
            className={cn(PILL_CLASS, meta.tone, CLICKABLE_PILL_CLASS, className)}
          >
            <span aria-hidden className="grid place-items-center">
              {meta.icon}
            </span>
            <span className="hidden lg:inline">{meta.label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="lg:hidden">
          {meta.label} — {meta.title}
        </TooltipContent>
      </Tooltip>
    );
  }

  // The settled state is the one worth explaining, so it opens the same kind
  // of explainer the local-only pill does. The transient and failed states
  // stay as they are: mid-flight status, or an error with its own action.
  if (syncState.kind === "idle") {
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              aria-label="End-to-end encrypted: how this is protected"
              className={cn(PILL_CLASS, meta.tone, CLICKABLE_PILL_CLASS, className)}
            >
              <span aria-hidden className="grid place-items-center">
                {meta.icon}
              </span>
              <span className="hidden lg:inline">{meta.label}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="lg:hidden">
            {meta.label}
          </TooltipContent>
        </Tooltip>
        <StatusInfoDialog
          open={infoOpen}
          onOpenChange={setInfoOpen}
          title="End-to-end encrypted"
        >
          <p>
            This matrix is shared by link, and everything in it is encrypted in
            this browser before it is uploaded: the title, every risk, every
            mitigation, and everything in the notes.
          </p>
          <p>
            The key lives in the part of the link after the{" "}
            <code className="rounded bg-rm-surface-2 px-1 py-0.5">#</code>,
            which browsers never send to a server. We hold only encrypted data
            we cannot read, so we cannot decrypt this matrix, hand it over, or
            lose it in a breach.
          </p>
        </StatusInfoDialog>
      </>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="status"
          aria-label={meta.title}
          className={cn(PILL_CLASS, meta.tone, className)}
        >
          <span aria-hidden className="grid place-items-center">
            {meta.icon}
          </span>
          <span className="hidden lg:inline">{meta.label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="lg:hidden">
        {meta.label}
      </TooltipContent>
    </Tooltip>
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
        label: "End-to-end encrypted",
        title: "All edits saved and end-to-end encrypted.",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200",
        icon: <LockKeyhole className="size-3.5 text-emerald-600 dark:text-emerald-400" />,
      };
    case "loading":
      return {
        label: "Loading…",
        title: "Fetching latest state.",
        tone: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-200",
        icon: <RefreshCw className="size-3.5" />,
      };
    case "syncing":
      return {
        label: "Syncing…",
        title: "Encrypting and uploading.",
        tone: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-200",
        icon: <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />,
      };
    case "offline":
      return {
        label: `Offline — retry ${state.attempt}`,
        title: state.message,
        tone: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200",
        icon: <CloudOff className="size-3.5" />,
      };
    case "rollback":
      return {
        label: "Rollback detected",
        title: state.message,
        tone: "border-red-300 bg-red-50 text-red-900 dark:border-red-800/70 dark:bg-red-950/40 dark:text-red-200",
        icon: <ShieldAlert className="size-3.5" />,
      };
    case "missing":
      return {
        label: "Link expired",
        title: "This shared matrix is no longer available on the server.",
        tone: "border-red-300 bg-red-50 text-red-900 dark:border-red-800/70 dark:bg-red-950/40 dark:text-red-200",
        icon: <CloudOff className="size-3.5" />,
      };
    case "error":
      return {
        label: "Sync error",
        title: state.message,
        tone: "border-red-300 bg-red-50 text-red-900 dark:border-red-800/70 dark:bg-red-950/40 dark:text-red-200",
        icon: <AlertTriangle className="size-3.5" />,
      };
  }
}
