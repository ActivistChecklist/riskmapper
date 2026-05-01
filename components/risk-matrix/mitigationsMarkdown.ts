import { COL_LABELS, ROW_LABELS } from "./constants";
import { cellKeyToTone, prependToneCircle } from "./riskTone";
import type { CellKey, GridLine, SubLine } from "./types";

/** One line of text safe to use after `- ` (and optional ⭐) in a Markdown bullet. */
function bulletLine(text: string): string {
  const oneLine = text.replace(/\n/g, " ").trim();
  return oneLine.replace(/^([-*+]|\d+\.)\s/, "\\$&");
}

/** Markdown list item for a mitigation sub-line, or null if empty. */
function bulletFromSubLine(s: SubLine): string | null {
  const t = s.text.replace(/\s+/g, " ").trim();
  if (t.length === 0) return null;
  const star = s.starred ? "⭐ " : "";
  return `- ${star}${bulletLine(t)}`;
}

/** Risk title safe for a `###` heading (strip leading `#` tokens). */
function riskHeadingTitle(line: GridLine): string {
  const raw = line.text.replace(/\s+/g, " ").trim() || "Untitled risk";
  return raw.replace(/^#{1,6}\s+/, "");
}

/** Markdown for one risk line’s mitigations, or null if none to export. */
function formatRiskMitigationsBlock(line: GridLine, cellKey: CellKey): string | null {
  const reduceArr = line.reduce ?? [];
  const prepareArr = line.prepare ?? [];
  const reduceBullets = reduceArr
    .map(bulletFromSubLine)
    .filter((b): b is string => b != null);
  const prepareBullets = prepareArr
    .map(bulletFromSubLine)
    .filter((b): b is string => b != null);
  if (reduceBullets.length === 0 && prepareBullets.length === 0) return null;

  const tone = cellKeyToTone(cellKey);
  const chunks: string[] = [
    `### ${prependToneCircle(riskHeadingTitle(line), tone)}`,
    "",
  ];
  if (reduceBullets.length > 0) {
    chunks.push("**Reductions**", "");
    for (const b of reduceBullets) chunks.push(b, "");
  }
  if (prepareBullets.length > 0) {
    chunks.push("**Preparations**", "");
    for (const b of prepareBullets) chunks.push(b, "");
  }
  return chunks.join("\n").replace(/\n+$/, "");
}

/**
 * Plain-text Markdown export of every non-empty mitigation and preparation,
 * grouped by matrix cell (likelihood × impact), then by risk.
 */
export function formatAllMitigationsMarkdown(
  grid: Record<CellKey, GridLine[]>,
): string {
  const cellSections: string[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const key = `${row}-${col}` as CellKey;
      const lines = grid[key] ?? [];
      const riskBlocks = lines
        .map((line) => formatRiskMitigationsBlock(line, key))
        .filter((b): b is string => b != null);
      if (riskBlocks.length === 0) continue;
      cellSections.push(
        `## ${prependToneCircle(`${ROW_LABELS[row]} · ${COL_LABELS[col]}`, cellKeyToTone(key))}\n\n${riskBlocks.join("\n\n")}`,
      );
    }
  }
  if (cellSections.length === 0) return "";
  return `# All mitigations\n\n${cellSections.join("\n\n")}\n`;
}

export function hasMitigationsMarkdownExport(
  grid: Record<CellKey, GridLine[]>,
): boolean {
  return formatAllMitigationsMarkdown(grid).length > 0;
}
