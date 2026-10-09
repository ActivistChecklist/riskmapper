"use client";

import React, { useRef, useState } from "react";
import { FilePlus, FileUp, History, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
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
import { trackEvent } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";
import DeleteMatrixDialog from "./DeleteMatrixDialog";
import ImportMatrixDialog from "./ImportMatrixDialog";
import type { MatrixWorkspaceApi } from "./useMatrixWorkspace";
import { DEFAULT_DRAFT_MATRIX_TITLE } from "./matrixTypes";
import {
  importedTitle,
  MATRIX_FILE_LIMITS,
  MatrixFileError,
  parseMatrixFile,
  summarizeImport,
  type MatrixImportSummary,
} from "./matrixFile";
import type { RiskMatrixSnapshot } from "./matrixTypes";

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

type PendingImport = {
  title: string;
  renamed: boolean;
  snapshot: RiskMatrixSnapshot;
  summary: MatrixImportSummary;
};

/**
 * Read and validate a matrix file the user picked. The file is read in this
 * tab; nothing is uploaded, and nothing is saved until the user confirms.
 */
async function readMatrixFile(
  file: File,
  existingTitles: string[],
): Promise<PendingImport | null> {
  if (file.size > MATRIX_FILE_LIMITS.bytes) {
    toast.error("That file is too large to be a Risk Mapper matrix file.");
    return null;
  }
  try {
    const { title, snapshot } = parseMatrixFile(await file.text());
    const saveAs = importedTitle(title, existingTitles);
    return {
      title: saveAs,
      renamed: saveAs !== title,
      snapshot,
      summary: summarizeImport(snapshot),
    };
  } catch (err) {
    toast.error(
      err instanceof MatrixFileError
        ? err.message
        : "Could not read that file.",
    );
    return null;
  }
}

/** New + Open recent + Import + Delete, in the toolbar under the title row. */
export function MatrixDocumentActions({
  workspace: ws,
  iconOnly = false,
  toolbar = false,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingMatrixDelete>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(
    null,
  );

  const confirmImport = async () => {
    if (!pendingImport) return;
    const { title, snapshot } = pendingImport;
    setPendingImport(null);
    const { saved, keptDraft } = await ws.importMatrix({ title, snapshot });
    if (!saved) {
      toast.error("Not enough space in this browser to import this matrix.", {
        description:
          "Nothing was changed. Delete matrices you no longer need from Open recent, then try again.",
      });
      return;
    }
    trackEvent("import_matrix_file");
    toast.success(`Imported "${title}"`, {
      description: keptDraft
        ? "Your previous unsaved matrix was saved too. Both are in Open recent."
        : "Saved in this browser. Find it again under Open recent.",
    });
  };
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

  const importBtn = (
    <Button
      variant={surface}
      size="sm"
      type="button"
      onClick={() => fileInputRef.current?.click()}
      className={iconBtn}
      aria-label={iconOnly ? "Import matrix file" : undefined}
    >
      <FileUp size={15} strokeWidth={2} aria-hidden />
      {!iconOnly ? "Import" : null}
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
          "text-rm-muted hover:bg-red-50 hover:text-red-800 active:bg-red-100/80 dark:hover:bg-red-950/40 dark:hover:text-red-200 dark:active:bg-red-900/50",
      )}
      aria-label="Delete this matrix from this browser"
    >
      <Trash2
        size={15}
        strokeWidth={2}
        aria-hidden
        className="text-rm-muted transition-colors group-hover:text-red-600"
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
        <TooltipTrigger asChild>{importBtn}</TooltipTrigger>
        <TooltipContent side="bottom">Import matrix file</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>{deleteBtn}</TooltipTrigger>
        <TooltipContent side="bottom">Delete this matrix</TooltipContent>
      </Tooltip>
    </>
  ) : (
    <>
      {newBtn}
      {recentBtn}
      <Tooltip>
        <TooltipTrigger asChild>{importBtn}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          Open a matrix file someone sent you, or one you downloaded
        </TooltipContent>
      </Tooltip>
      {deleteBtn}
    </>
  );

  return (
    <>
      <div
        className={cn(
          "flex min-w-0 flex-nowrap items-center",
          toolbar ? "w-full gap-1" : "gap-2",
        )}
      >
        {leftCluster}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        data-testid="matrix-file-input"
        onChange={(e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          // Clear so picking the same file again still fires `change`.
          input.value = "";
          if (!file) return;
          void readMatrixFile(
            file,
            // The active title too: an unsaved draft joins the library
            // under its own name when the import goes ahead.
            [ws.activeTitle, ...ws.workspace.saved.map((m) => m.title)],
          ).then((pending) => {
            if (pending) setPendingImport(pending);
          });
        }}
      />

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
                  className="flex gap-1 rounded-md border border-rm-border bg-rm-surface p-1"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col items-start rounded px-2 py-1.5 text-left text-sm hover:bg-rm-surface-hover focus-visible:ring-2 focus-visible:ring-rm-ring"
                    onClick={() => {
                      ws.openSaved(m.id);
                      setRecentOpen(false);
                    }}
                  >
                    <span className="flex w-full min-w-0 items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate font-medium text-rm-ink">
                        {m.title}
                      </span>
                      {m.cloud ? (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
                          title="Shared via cloud sync"
                        >
                          <UsersRound size={12} aria-hidden />
                          Shared
                        </span>
                      ) : null}
                    </span>
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
                      className="text-rm-muted transition-colors group-hover:text-red-600"
                    />
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ImportMatrixDialog
        open={pendingImport != null}
        onOpenChange={(open) => {
          if (!open) setPendingImport(null);
        }}
        title={pendingImport?.title ?? ""}
        renamed={pendingImport?.renamed ?? false}
        summary={pendingImport?.summary ?? null}
        onConfirm={() => {
          void confirmImport();
        }}
      />
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
              className="mt-1 w-full rounded-md border border-rm-border-strong bg-rm-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-rm-ring"
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

