"use client";

import React from "react";
import { MatrixDocumentActions, MatrixHelpTrigger } from "./MatrixToolbar";
import type { MatrixWorkspaceApi } from "./useMatrixWorkspace";

type Props = {
  workspace: MatrixWorkspaceApi;
};

export default function MatrixTopBar({ workspace: ws }: Props) {
  const showTitle = ws.workspace.activeKind === "saved";

  return (
    <div className="mb-3 flex min-h-9 flex-wrap items-center gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <MatrixDocumentActions workspace={ws} />
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <h1 className="shrink-0 text-xs font-semibold uppercase tracking-[0.15em] opacity-85 sm:text-sm">
          risk matrix
        </h1>
        {showTitle ? (
          <input
            type="text"
            value={ws.activeTitle}
            onChange={(e) => ws.setActiveTitle(e.target.value)}
            onBlur={(e) => {
              const t = e.target.value.trim();
              ws.setActiveTitle(t.length > 0 ? t : "Untitled");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="e.g. Direct action — safety & legal risks"
            aria-label="Matrix title"
            className="min-w-0 max-w-[min(100%,28rem)] flex-1 border-b border-black/15 bg-transparent px-0.5 py-0.5 text-sm font-medium text-rm-ink outline-none placeholder:opacity-50 focus-visible:border-rm-primary focus-visible:ring-2 focus-visible:ring-black/10"
          />
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center">
        <MatrixHelpTrigger />
      </div>
    </div>
  );
}
