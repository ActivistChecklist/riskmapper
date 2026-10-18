import { groupActionsByTier, OTHER_ACTIONS_LABEL } from "./actionGroups";
import { PROMPT_HEX, TIER_STRIPE_HEX, TIER_TEXT_HEX } from "./exportColors";
import { escapeMarkdownFetches } from "./markdownEscape";
import { prependToneCircle } from "./riskTone";
import type { OtherAction, StarredAction } from "./types";

/** Escape text for safe inclusion in `text/html` clipboard payloads. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bullet(text: string): string {
  const oneLine = escapeMarkdownFetches(text.replace(/\s+/g, " ").trim());
  return `- ${oneLine || "(empty)"}`;
}

/**
 * Actions as Markdown, laid out like the Actions panel: starred actions
 * grouped by tier ("🔴 For highest risks"), then other actions. No source
 * risk, matching the panel. `heading` formats each group label, so the
 * standalone copy can use bold and the full report real headings. Other
 * actions get a label only when starred ones are listed above them.
 */
export function formatActionsMarkdown(
  starred: StarredAction[],
  other: OtherAction[],
  heading: (label: string) => string = (label) => `**${label}**`,
): string {
  const blocks = groupActionsByTier(starred).map(({ tone, label, actions }) =>
    [
      heading(prependToneCircle(label, tone)),
      "",
      ...actions.map((a) => bullet(a.subLine.text)),
    ].join("\n"),
  );
  const others = other.filter((o) => o.text.trim().length > 0);
  if (others.length > 0) {
    const list = others.map((o) => bullet(o.text)).join("\n");
    blocks.push(
      blocks.length > 0 ? `${heading(OTHER_ACTIONS_LABEL)}\n\n${list}` : list,
    );
  }
  return blocks.join("\n\n");
}

export function formatAllForClipboard(
  starred: StarredAction[],
  other: OtherAction[],
): string {
  return formatActionsMarkdown(starred, other);
}

function groupHtml(
  label: string,
  labelColor: string,
  stripeColor: string,
  items: string[],
  marker: string,
): string {
  const lis = items
    .map(
      (t) =>
        `<li style="margin:0 0 0.35em 0;list-style:none;">${marker}${escapeHtml(t)}</li>`,
    )
    .join("");
  return (
    `<p style="margin:0.9em 0 0.3em 0;font-size:0.85em;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${labelColor};">${escapeHtml(label)}</p>` +
    `<ul style="margin:0;padding:2px 0 2px 10px;border-left:4px solid ${stripeColor};">${lis}</ul>`
  );
}

/** Inner HTML only (no document wrapper); caller wraps for clipboard. */
export function formatAllForClipboardHtmlInner(
  starred: StarredAction[],
  other: OtherAction[],
): string {
  const parts = groupActionsByTier(starred).map(({ tone, label, actions }) =>
    groupHtml(
      label,
      TIER_TEXT_HEX[tone],
      TIER_STRIPE_HEX[tone],
      actions.map((a) => a.subLine.text.trim() || "(empty)"),
      "★ ",
    ),
  );
  const others = other.map((o) => o.text.trim()).filter((t) => t.length > 0);
  if (others.length > 0) {
    parts.push(
      parts.length > 0
        ? groupHtml(OTHER_ACTIONS_LABEL, PROMPT_HEX, "#d4d4d8", others, "• ")
        : `<ul style="margin:0;padding-left:0;">${others
            .map(
              (t) =>
                `<li style="margin:0 0 0.35em 0;list-style:none;">• ${escapeHtml(t)}</li>`,
            )
            .join("")}</ul>`,
    );
  }
  return parts.join("");
}

export function buildActionsClipboardPayload(
  starred: StarredAction[],
  other: OtherAction[],
): { plain: string; html: string } {
  const plain = formatAllForClipboard(starred, other);
  const inner = formatAllForClipboardHtmlInner(starred, other);
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>` +
    `${inner}</body></html>`;
  return { plain, html };
}
