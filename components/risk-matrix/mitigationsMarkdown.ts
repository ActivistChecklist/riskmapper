import { COL_LABELS, ROW_LABELS } from "./constants";
import type { CellKey, GridLine, SubLine } from "./types";

function nonEmptyTrimmed(lines: SubLine[] | undefined): string[] {
  return (lines ?? [])
    .map((s) => s.text.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0);
}

/** One line of text safe to use after `- ` in a Markdown bullet. */
function bulletLine(text: string): string {
  const oneLine = text.replace(/\n/g, " ").trim();
  return oneLine.replace(/^([-*+]|\d+\.)\s/, "\\$&");
}

/** Risk title safe for a `###` heading (strip leading `#` tokens). */
function riskHeadingTitle(line: GridLine): string {
  const raw = line.text.replace(/\s+/g, " ").trim() || "Untitled risk";
  return raw.replace(/^#{1,6}\s+/, "");
}

/** Markdown for one risk line’s mitigations, or null if none to export. */
function formatRiskMitigationsBlock(line: GridLine): string | null {
  const reduce = nonEmptyTrimmed(line.reduce);
  const prepare = nonEmptyTrimmed(line.prepare);
  if (reduce.length === 0 && prepare.length === 0) return null;

  const chunks: string[] = [`### ${riskHeadingTitle(line)}`, ""];
  if (reduce.length > 0) {
    chunks.push("**Reductions**", "");
    for (const t of reduce) chunks.push(`- ${bulletLine(t)}`, "");
  }
  if (prepare.length > 0) {
    chunks.push("**Preparations**", "");
    for (const t of prepare) chunks.push(`- ${bulletLine(t)}`, "");
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
        .map(formatRiskMitigationsBlock)
        .filter((b): b is string => b != null);
      if (riskBlocks.length === 0) continue;
      cellSections.push(
        `## ${ROW_LABELS[row]} · ${COL_LABELS[col]}\n\n${riskBlocks.join("\n\n")}`,
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
