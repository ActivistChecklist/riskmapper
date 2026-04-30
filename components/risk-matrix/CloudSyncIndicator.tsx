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
import type { SyncState } from "./cloudWriteQueue";

export type CloudSyncIndicatorProps = {
  state: SyncState;
  className?: string;
  /**
   * Called when the user clicks the indicator while it's in an actionable
   * state (conflict, rollback, missing, error). Lets the host re-open the
   * relevant dialog after a previous dismissal.
   */
  onAction?: () => void;
};

const ACTIONABLE_STATES = new Set(["conflict", "rollback", "missing", "error"]);

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
        className={cn(sharedClassName, "hover:brightness-95 focus-visible:ring-2 focus-visible:ring-black/20")}
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
        tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
        icon: <Check className="size-3.5" />,
      };
    case "pending":
      return {
        label: "Pending…",
        title: "Edits queued; waiting to send.",
        tone: "border-amber-200 bg-amber-50 text-amber-900",
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
    case "conflict":
      return {
        label: "Conflict",
        title: "Remote was edited from another device. Choose how to resolve.",
        tone: "border-amber-400 bg-amber-100 text-amber-950",
        icon: <AlertTriangle className="size-3.5" />,
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
