"use client";

import React, { useState } from "react";
import { CircleCheck, FilePlus, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import DeleteMatrixDialog from "./DeleteMatrixDialog";
import type { MatrixWorkspaceApi } from "./useMatrixWorkspace";
import { DEFAULT_DRAFT_MATRIX_TITLE } from "./matrixTypes";

type PendingMatrixDelete =
  | null
  | { kind: "saved"; id: string; title: string }
  | { kind: "current"; title: string };

type Props = {
  workspace: MatrixWorkspaceApi;
  /** When true, show icon-only controls (labels via tooltip / aria-label). */
  iconOnly?: boolean;
  /** Document actions on the top strip — ghost-style buttons on a panel background. */
  toolbar?: boolean;
};

function needsMatrixNamePrompt(title: string): boolean {
  const t = title.trim();
  if (t.length === 0) return true;
  return t.toLowerCase() === DEFAULT_DRAFT_MATRIX_TITLE.toLowerCase();
}

/** New + Open recent — after the site title and matrix title in the top bar. */
export function MatrixDocumentActions({
  workspace: ws,
  iconOnly = false,
  toolbar = false,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [savedLocallyOpen, setSavedLocallyOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingMatrixDelete>(null);
  const hasRecent = ws.recentSorted.length > 0;

  const confirmPendingDelete = () => {
    if (!pendingDelete) return;
    const kind = pendingDelete.kind;
    if (kind === "saved") {
      ws.removeSavedMatrix(pendingDelete.id);
    } else {
      ws.deleteActiveMatrix();
      setRecentOpen(false);
    }
    setPendingDelete(null);
  };

  const cancelPendingDelete = () => setPendingDelete(null);

  const openCreateDialog = () => {
    const current = ws.activeTitle;
    if (needsMatrixNamePrompt(current)) {
      setNameInput("");
      setCreateOpen(true);
      return;
    }
    ws.createNewNamed(current.trim());
  };

  const submitCreate = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    ws.createNewNamed(trimmed);
    setCreateOpen(false);
    setNameInput("");
  };

  const iconBtn = iconOnly ? "gap-0 px-2" : "";
  const surface = toolbar ? "ghost" : "outline";

  const newBtn = (
    <Button
      variant={surface}
      size="sm"
      type="button"
      onClick={openCreateDialog}
      className={iconBtn}
      aria-label={iconOnly ? "New matrix" : undefined}
    >
      <FilePlus size={15} strokeWidth={2} aria-hidden />
      {!iconOnly ? "New" : null}
    </Button>
  );

  const recentBtn = hasRecent ? (
    <Button
      variant={surface}
      size="sm"
      type="button"
      onClick={() => setRecentOpen(true)}
      className={iconBtn}
      aria-label={iconOnly ? "Open recent" : undefined}
    >
      <History size={15} strokeWidth={2} aria-hidden />
      {!iconOnly ? "Open recent" : null}
    </Button>
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={0}>
          <Button
            variant={surface}
            size="sm"
            type="button"
            disabled
            className={iconBtn}
            aria-label={iconOnly ? "Open recent" : undefined}
          >
            <History size={15} strokeWidth={2} aria-hidden />
            {!iconOnly ? "Open recent" : null}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        No saved matrices yet. Use New to save the current sheet to your
        library; saved matrices will appear here.
      </TooltipContent>
    </Tooltip>
  );

  const savedBtn = (
    <Button
      variant={surface}
      size="sm"
      type="button"
      onClick={() => setSavedLocallyOpen(true)}
      className={cn(
        iconBtn,
        toolbar &&
          "text-emerald-900 hover:bg-emerald-50 hover:text-emerald-950 active:bg-emerald-100/80",
        !toolbar && "text-zinc-700",
      )}
      aria-label="Saved locally: where your work is kept"
    >
      <CircleCheck
        size={15}
        strokeWidth={2}
        aria-hidden
        className={toolbar ? "text-emerald-600" : undefined}
      />
      {!iconOnly ? "Saved locally" : null}
    </Button>
  );

  const deleteBtn = (
    <Button
      variant={toolbar ? "ghost" : "destructiveOutline"}
      size="sm"
      type="button"
      onClick={() =>
        setPendingDelete({ kind: "current", title: ws.activeTitle })
      }
      className={cn(
        iconBtn,
        toolbar &&
          "text-zinc-700 hover:bg-red-50 hover:text-red-800 active:bg-red-100/80",
      )}
      aria-label="Delete this matrix from this browser"
    >
      <Trash2
        size={15}
        strokeWidth={2}
        aria-hidden
        className="text-zinc-600 transition-colors group-hover:text-red-600"
      />
      {!iconOnly ? "Delete" : null}
    </Button>
  );

  const leftCluster = iconOnly ? (
    <>
      <Tooltip>
        <TooltipTrigger asChild>{newBtn}</TooltipTrigger>
        <TooltipContent side="bottom">New matrix</TooltipContent>
      </Tooltip>
      {hasRecent ? (
        <Tooltip>
          <TooltipTrigger asChild>{recentBtn}</TooltipTrigger>
          <TooltipContent side="bottom">Open recent</TooltipContent>
        </Tooltip>
      ) : (
        recentBtn
      )}
      <Tooltip>
        <TooltipTrigger asChild>{deleteBtn}</TooltipTrigger>
        <TooltipContent side="bottom">Delete this matrix</TooltipContent>
      </Tooltip>
    </>
  ) : (
    <>
      {newBtn}
      {recentBtn}
      {deleteBtn}
    </>
  );

  const savedCluster = iconOnly ? (
    <Tooltip>
      <TooltipTrigger asChild>{savedBtn}</TooltipTrigger>
      <TooltipContent side="bottom">Saved on your device</TooltipContent>
    </Tooltip>
  ) : (
    savedBtn
  );

  return (
    <>
      <div
        className={cn(
          "flex min-w-0 flex-nowrap items-center",
          toolbar && "w-full justify-between gap-2 sm:gap-4",
          !toolbar && "gap-2",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-nowrap items-center",
            toolbar ? "gap-1" : "gap-2",
          )}
        >
          {leftCluster}
        </div>
        <div className="shrink-0">{savedCluster}</div>
      </div>

      <Dialog open={savedLocallyOpen} onOpenChange={setSavedLocallyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saved on your device</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-1 text-sm leading-relaxed text-rm-ink opacity-90">
                <p>
                  Nothing you type here is sent over the internet or stored on our
                  servers or in the cloud. Your risks, notes, and saved matrices stay
                  in this browser on this computer, like notes in a notebook that never
                  leave your desk.
                </p>
                <p>
                  If you clear this site&apos;s data in your browser, the data will be
                  deleted.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={() => setSavedLocallyOpen(false)}>
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={recentOpen} onOpenChange={setRecentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open recent</DialogTitle>
            <DialogDescription>
              Choose a saved matrix. Your current matrix is saved automatically
              before switching.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 max-h-[min(60vh,420px)] space-y-1 overflow-y-auto">
            {ws.recentSorted.length === 0 ? (
              <p className="text-sm opacity-80">No saved matrices.</p>
            ) : (
              ws.recentSorted.map((m) => (
                <div
                  key={m.id}
                  className="flex gap-1 rounded-md border border-black/10 bg-white p-1"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col items-start rounded px-2 py-1.5 text-left text-sm hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-black/15"
                    onClick={() => {
                      ws.openSaved(m.id);
                      setRecentOpen(false);
                    }}
                  >
                    <span className="font-medium text-rm-ink">{m.title}</span>
                    <span className="text-xs opacity-70">
                      {new Date(m.updatedAt).toLocaleString()}
                    </span>
                  </button>
                  <Button
                    variant="destructiveOutline"
                    type="button"
                    size="sm"
                    className="h-auto shrink-0 px-2 py-2"
                    aria-label={`Delete saved matrix: ${m.title}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setPendingDelete({
                        kind: "saved",
                        id: m.id,
                        title: m.title,
                      });
                    }}
                  >
                    <Trash2
                      size={15}
                      strokeWidth={2}
                      aria-hidden
                      className="text-zinc-600 transition-colors group-hover:text-red-600"
                    />
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DeleteMatrixDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        matrixTitle={pendingDelete?.title ?? ""}
        onCancel={cancelPendingDelete}
        onConfirm={confirmPendingDelete}
      />
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setNameInput("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name this matrix</DialogTitle>
            <DialogDescription>
              Your current matrix is saved first, then you start with a blank
              sheet.
            </DialogDescription>
          </DialogHeader>
          <label className="mt-2 block text-sm font-medium text-rm-ink">
            Name
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitCreate();
                }
              }}
              className="mt-1 w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-black/15"
              placeholder="e.g. Direct action — safety & legal risks"
              autoFocus
              aria-label="Name for the current matrix"
            />
          </label>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitCreate}
              disabled={!nameInput.trim()}
            >
              Save and start new
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

