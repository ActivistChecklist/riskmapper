import { formatAllForClipboard } from "./actionsClipboard";
import { COL_LABELS, ROW_LABELS } from "./constants";
import { formatAllMitigationsMarkdown } from "./mitigationsMarkdown";
import { cellKeyToTone, prependToneCircle } from "./riskTone";
import type { CellKey, GridLine, OtherAction, PoolLine, StarredAction } from "./types";

export function canCopyPool(pool: PoolLine[]): boolean {
  return pool.some((p) => p.text.trim().length > 0);
}

export function canCopyMatrix(grid: Record<CellKey, GridLine[]>): boolean {
  return Object.values(grid).some((lines) =>
    lines.some((l) => l.text.trim().length > 0),
  );
}

export function formatRiskPoolPlain(pool: PoolLine[]): string {
  const lines = pool.map((p) => p.text.trim()).filter((t) => t.length > 0);
  if (lines.length === 0) return "(No risks in the pool.)";
  return lines.map((t, i) => `${i + 1}. ${t}`).join("\n");
}

export function formatMatrixRisksPlain(
  grid: Record<CellKey, GridLine[]>,
): string {
  const parts: string[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const key = `${row}-${col}` as CellKey;
      const lines = (grid[key] ?? []).filter((l) => l.text.trim());
      if (lines.length === 0) continue;
      const tone = cellKeyToTone(key);
      const header = prependToneCircle(`${ROW_LABELS[row]} · ${COL_LABELS[col]}`, tone);
      const body = lines
        .map((l, i) => `${i + 1}. ${prependToneCircle(l.text.trim(), tone)}`)
        .join("\n");
      parts.push(`### ${header}\n\n${body}`);
    }
  }
  if (parts.length === 0) return "(No risks on the matrix.)";
  return parts.join("\n\n");
}

/** Strips the document H1 so this block can sit under another title. */
export function formatMitigationsMarkdownBody(
  grid: Record<CellKey, GridLine[]>,
): string {
  const full = formatAllMitigationsMarkdown(grid);
  return full.replace(/^# All mitigations\s*\n+/, "").trimEnd();
}

function shiftMarkdownHeadingDepth(markdown: string, depth: number): string {
  if (!markdown.trim() || depth <= 0) return markdown;
  return markdown.replace(/^(#{1,6})(\s+)/gm, (_, hashes: string, space: string) => {
    const nextDepth = Math.min(6, hashes.length + depth);
    return `${"#".repeat(nextDepth)}${space}`;
  });
}

function formatActionsMarkdownSection(
  allActions: StarredAction[],
  otherActions: OtherAction[],
): string {
  const starredPart = formatAllForClipboard(allActions, []).trim();
  const otherNonEmpty = otherActions
    .map((o) => o.text.trim())
    .filter((t) => t.length > 0);
  if (!starredPart && otherNonEmpty.length === 0) {
    return "(No actions listed yet.)";
  }
  const chunks: string[] = [];
  if (starredPart) {
    chunks.push("### Prioritized actions", "", starredPart);
  }
  if (otherNonEmpty.length > 0) {
    const otherBlock = otherNonEmpty.map((t, i) => `${i + 1}. ${t}`).join("\n\n");
    if (chunks.length > 0) chunks.push("");
    chunks.push("### Other actions", "", otherBlock);
  }
  return chunks.join("\n");
}

export function buildFullPlainReport(args: {
  title: string;
  pool: PoolLine[];
  grid: Record<CellKey, GridLine[]>;
  allActions: StarredAction[];
  otherActions: OtherAction[];
}): string {
  const { title, pool, grid, allActions, otherActions } = args;
  const head = title.trim() || "Untitled";
  const mitBody = shiftMarkdownHeadingDepth(formatMitigationsMarkdownBody(grid), 1);
  const actionsBody = formatActionsMarkdownSection(allActions, otherActions);
  const chunks: string[] = [
    `# ${head}`,
    "",
    "## Risk pool",
    "",
    formatRiskPoolPlain(pool),
    "",
    "## Risk matrix",
    "",
    formatMatrixRisksPlain(grid),
    "",
    "## Mitigations & preparations",
    "",
    mitBody.length > 0 ? mitBody : "(No mitigations yet.)",
    "",
    "## Actions",
    "",
    actionsBody,
  ];
  return chunks.join("\n").trimEnd();
}

export function buildSummaryPlain(args: {
  title: string;
  pool: PoolLine[];
  grid: Record<CellKey, GridLine[]>;
  allActions: StarredAction[];
  otherActions: OtherAction[];
}): string {
  const titleLine = args.title.trim() || "Untitled";
  const actionsPlain = formatAllForClipboard(
    args.allActions,
    args.otherActions,
  ).trim();
  const poolN = args.pool.filter((p) => p.text.trim()).length;
  let matrixN = 0;
  for (const lines of Object.values(args.grid)) {
    matrixN += lines.filter((l) => l.text.trim()).length;
  }
  const parts: string[] = [`# ${titleLine}`, ""];
  parts.push("## Risk pool", "", `- Total lines: ${poolN}`, "");
  parts.push("## Risk matrix", "", `- Total risks on matrix: ${matrixN}`, "");
  parts.push(
    "## Mitigations & preparations",
    "",
    "- Included in full worksheet export.",
    "",
  );
  if (actionsPlain) {
    parts.push("## Actions", "", actionsPlain);
  } else {
    parts.push("## Actions", "", "_No prioritized actions yet._");
  }
  return parts.join("\n");
}
