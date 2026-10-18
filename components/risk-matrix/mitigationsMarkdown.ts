import { COLOR_GROUPS, MITIGATION_PROMPTS } from "./constants";
import { escapeMarkdownFetches } from "./markdownEscape";
import { prependToneCircle } from "./riskTone";
import type { CellKey, ColorGroupKey, GridLine, SubLine } from "./types";

/** One line of text safe to use after `- ` (and optional ⭐) in a Markdown bullet. */
function bulletLine(text: string): string {
  const oneLine = escapeMarkdownFetches(text.replace(/\n/g, " ").trim());
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
  return escapeMarkdownFetches(raw.replace(/^#{1,6}\s+/, ""));
}

/** Markdown for one risk line’s mitigations, or null if none to export. */
function formatRiskMitigationsBlock(
  line: GridLine,
  tone: ColorGroupKey,
): string | null {
  const reduceArr = line.reduce ?? [];
  const prepareArr = line.prepare ?? [];
  const reduceBullets = reduceArr
    .map(bulletFromSubLine)
    .filter((b): b is string => b != null);
  const prepareBullets = prepareArr
    .map(bulletFromSubLine)
    .filter((b): b is string => b != null);
  if (reduceBullets.length === 0 && prepareBullets.length === 0) return null;

  const chunks: string[] = [
    `### ${prependToneCircle(riskHeadingTitle(line), tone)}`,
    "",
  ];
  // The same two questions the app shows under each risk.
  if (reduceBullets.length > 0) {
    chunks.push(`**${MITIGATION_PROMPTS.reduce}**`, "");
    for (const b of reduceBullets) chunks.push(b, "");
  }
  if (prepareBullets.length > 0) {
    chunks.push(`**${MITIGATION_PROMPTS.prepare}**`, "");
    for (const b of prepareBullets) chunks.push(b, "");
  }
  return chunks.join("\n").replace(/\n+$/, "");
}

/**
 * Plain-text Markdown export of every non-empty mitigation, laid out like
 * step 3: grouped by risk tier (highest first), then by risk, with each
 * risk's two questions as labels. Starred lines come first in each list
 * because the app keeps them there.
 */
export function formatAllMitigationsMarkdown(
  grid: Record<CellKey, GridLine[]>,
): string {
  const tierSections: string[] = [];
  for (const group of COLOR_GROUPS) {
    const riskBlocks = group.cells
      .flatMap((cellKey) => grid[cellKey] ?? [])
      .map((line) => formatRiskMitigationsBlock(line, group.key))
      .filter((b): b is string => b != null);
    if (riskBlocks.length === 0) continue;
    tierSections.push(
      `## ${prependToneCircle(group.label, group.key)}\n\n${riskBlocks.join("\n\n")}`,
    );
  }
  if (tierSections.length === 0) return "";
  return `# All mitigations\n\n${tierSections.join("\n\n")}\n`;
}

export function hasMitigationsMarkdownExport(
  grid: Record<CellKey, GridLine[]>,
): boolean {
  return formatAllMitigationsMarkdown(grid).length > 0;
}
