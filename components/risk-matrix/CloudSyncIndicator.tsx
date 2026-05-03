"use client";

import React from "react";
import {
  AlertTriangle,
  Check,
  CloudOff,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sync states for the new append-only transport. There's no "conflict"
 * state anymore — concurrent edits resolve automatically via Yjs merge.
 */
export type SyncState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "syncing" }
  | { kind: "offline"; attempt: number; message: string }
  | { kind: "missing" }
  | { kind: "rollback"; message: string }
  | { kind: "error"; message: string };

export type CloudSyncIndicatorProps = {
  state: SyncState;
  className?: string;
  /** Called when the user clicks an actionable indicator. */
  onAction?: () => void;
};

const ACTIONABLE_STATES = new Set(["rollback", "missing", "error"]);

export default function CloudSyncIndicator({
  state,
  className,
  onAction,
}: CloudSyncIndicatorProps) {
  const meta = describe(state);
  const sharedClassName = cn(
    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
    meta.tone,
    className,
  );
  const inner = (
    <>
      <span aria-hidden className="grid place-items-center">
        {meta.icon}
      </span>
      <span>{meta.label}</span>
    </>
  );

  if (ACTIONABLE_STATES.has(state.kind)) {
    return (
      <button
        type="button"
        aria-label={meta.title}
        title={meta.title}
        className={cn(sharedClassName, "hover:brightness-95 dark:hover:brightness-110 focus-visible:ring-2 focus-visible:ring-rm-ring")}
        onClick={onAction}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      role="status"
      aria-label={meta.title}
      title={meta.title}
      className={sharedClassName}
    >
      {inner}
    </div>
  );
}

type Display = {
  label: string;
  title: string;
  tone: string;
  icon: React.ReactNode;
};

function describe(state: SyncState): Display {
  switch (state.kind) {
    case "idle":
      return {
        label: "Synced",
        title: "All edits saved to the cloud.",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200",
        icon: <Check className="size-3.5" />,
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
