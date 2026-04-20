import { toast } from "sonner";
import {
  buildActionsClipboardPayload,
  formatAllForClipboard,
} from "./actionsClipboard";
import {
  buildFullPlainReport,
  buildSummaryPlain,
  formatMatrixRisksPlain,
  formatRiskPoolPlain,
} from "./matrixExport";
import { formatAllMitigationsMarkdown } from "./mitigationsMarkdown";
import type { CellKey, GridLine, OtherAction, PoolLine, StarredAction } from "./types";

async function writePlain(text: string, okMessage: string): Promise<boolean> {
  const t = text.trim();
  if (!t) {
    toast.error("Nothing to copy");
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMessage);
    return true;
  } catch {
    toast.error("Could not copy — check clipboard permissions.");
    return false;
  }
}

export async function copyFullReport(args: {
  title: string;
  pool: PoolLine[];
  grid: Record<CellKey, GridLine[]>;
  allActions: StarredAction[];
  otherActions: OtherAction[];
}): Promise<boolean> {
  return writePlain(
    buildFullPlainReport(args),
    "Copied full worksheet",
  );
}

export async function copySummary(args: {
  title: string;
  pool: PoolLine[];
  grid: Record<CellKey, GridLine[]>;
  allActions: StarredAction[];
  otherActions: OtherAction[];
}): Promise<boolean> {
  return writePlain(buildSummaryPlain(args), "Copied summary");
}

export async function copyRiskPool(pool: PoolLine[]): Promise<boolean> {
  return writePlain(formatRiskPoolPlain(pool), "Copied risk pool");
}

export async function copyMatrixRisks(
  grid: Record<CellKey, GridLine[]>,
): Promise<boolean> {
  return writePlain(formatMatrixRisksPlain(grid), "Copied matrix");
}

export async function copyMitigationsMarkdown(
  grid: Record<CellKey, GridLine[]>,
): Promise<boolean> {
  const md = formatAllMitigationsMarkdown(grid);
  if (!md.trim()) {
    toast.error("Nothing to copy");
    return false;
  }
  return writePlain(md, "Copied all mitigations");
}

export async function copyStarredActions(
  allActions: StarredAction[],
  otherActions: OtherAction[],
): Promise<boolean> {
  const plain = formatAllForClipboard(allActions, otherActions);
  if (!plain.trim()) {
    toast.error("Nothing to copy");
    return false;
  }
  const { html } = buildActionsClipboardPayload(allActions, otherActions);
  const mark = () => {
    toast.success("Copied actions");
  };
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      mark();
      return true;
    }
  } catch {
    // fall through
  }
  try {
    await navigator.clipboard.writeText(plain);
    mark();
    return true;
  } catch {
    toast.error("Could not copy — check clipboard permissions.");
    return false;
  }
}
