"use client";

import React, { useState } from "react";
import { CircleHelp, FilePlus, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { MatrixWorkspaceApi } from "./useMatrixWorkspace";

type Props = {
  workspace: MatrixWorkspaceApi;
};

/** Open recent + Create new — kept to the left of the matrix title in the top bar. */
export function MatrixDocumentActions({ workspace: ws }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const openCreateDialog = () => {
    const preset =
      ws.workspace.activeKind === "saved" ? ws.activeTitle : "";
    setNameInput(preset);
    setCreateOpen(true);
  };

  const submitCreate = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    ws.createNewNamed(trimmed);
    setCreateOpen(false);
    setNameInput("");
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={() => setRecentOpen(true)}
      >
        <History size={15} strokeWidth={2} aria-hidden />
        Open recent
      </Button>
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
              <p className="text-sm opacity-80">No saved matrices yet.</p>
            ) : (
              ws.recentSorted.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="flex w-full flex-col items-start rounded-md border border-black/10 bg-white px-3 py-2 text-left text-sm hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-black/15"
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
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Button variant="outline" size="sm" type="button" onClick={openCreateDialog}>
        <FilePlus size={15} strokeWidth={2} aria-hidden />
        Create new
      </Button>
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
              placeholder="e.g. Q1 vendor review"
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

export function MatrixHelpTrigger() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" type="button">
          <CircleHelp size={15} strokeWidth={2} aria-hidden />
          Help
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How to use this matrix</DialogTitle>
          <DialogDescription>
            Capture risks in the top pool, then drag each item into the matrix
            cell that matches likelihood and impact.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-3 space-y-2 text-sm opacity-90">
          <p>
            Add mitigation ideas under each categorized risk, then star key
            items to also list them in the Actions panel.
          </p>
          <p>
            Keep each line short and specific so your priority actions stay easy
            to review.
          </p>
          <p>
            <span className="font-medium text-rm-ink">Pool shortcut:</span> end a
            pool line with{" "}
            <code className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[13px]">
              impact / likelihood
            </code>{" "}
            (impact, slash, likelihood) to move that risk into the matching
            cell—e.g.{" "}
            <code className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[13px]">
              HI/HL
            </code>{" "}
            or{" "}
            <code className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[13px]">
              LI/LL
            </code>
            . Use short codes only—the token before the slash is impact (e.g.{" "}
            <span className="font-mono text-[13px]">HI</span>,{" "}
            <span className="font-mono text-[13px]">MI</span>,{" "}
            <span className="font-mono text-[13px]">LI</span>
            ), after the slash is likelihood (e.g.{" "}
            <span className="font-mono text-[13px]">HL</span>,{" "}
            <span className="font-mono text-[13px]">ML</span>,{" "}
            <span className="font-mono text-[13px]">LL</span>
            ). Alternate spellings like{" "}
            <span className="font-mono text-[13px]">IL</span> or{" "}
            <span className="font-mono text-[13px]">LH</span> work too.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
