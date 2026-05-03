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
import { buildRichWorksheetHtml } from "./richTextWorksheet";
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

/**
 * Rich-text export of the full worksheet — paste into Gmail, Google Docs,
 * or Word and the matrix shows up as a real coloured table, mitigations
 * as a real grouped table, and notes with their markdown formatting
 * preserved (headings, bold/italic, bullets, links). Falls back to the
 * plain-text report on browsers without async clipboard support.
 */
export async function copyRichWorksheet(args: {
  title: string;
  pool: PoolLine[];
  grid: Record<CellKey, GridLine[]>;
  allActions: StarredAction[];
  otherActions: OtherAction[];
  notes: string;
}): Promise<boolean> {
  const plain = buildFullPlainReport(args);
  if (!plain.trim()) {
    toast.error("Nothing to copy");
    return false;
  }
  const html = buildRichWorksheetHtml(args);
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      toast.success("Copied as rich text");
      return true;
    }
  } catch {
    // fall through to plain-text path
  }
  try {
    await navigator.clipboard.writeText(plain);
    toast.success("Copied (plain text fallback)");
    return true;
  } catch {
    toast.error("Could not copy — check clipboard permissions.");
    return false;
  }
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
