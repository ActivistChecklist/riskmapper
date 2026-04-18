import type { OtherAction, StarredAction } from "./types";

/** Escape text for safe inclusion in `text/html` clipboard payloads. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatStarredForClipboard(actions: StarredAction[]): string {
  if (actions.length === 0) return "";
  return actions
    .map((a, i) => {
      const kind = a.subType === "reduce" ? "Reduction for" : "Preparation for";
      const risk = a.parentText.trim() || "Untitled risk";
      const body = a.subLine.text.trim() || "(empty)";
      return `${i + 1}. ${body}\n   ${kind} ${risk}`;
    })
    .join("\n\n");
}

export function formatAllForClipboard(
  starred: StarredAction[],
  other: OtherAction[],
): string {
  const starPart = formatStarredForClipboard(starred);
  const otherNonEmpty = other
    .map((o) => o.text.trim())
    .filter((t) => t.length > 0);
  if (otherNonEmpty.length === 0) return starPart;
  const otherBlock = otherNonEmpty
    .map((t, i) => `${i + 1}. ${t}`)
    .join("\n\n");
  const labeled =
    starred.length > 0 ? `Other actions:\n${otherBlock}` : otherBlock;
  if (!starPart) return labeled;
  return `${starPart}\n\n${labeled}`;
}

function formatStarredForClipboardHtml(actions: StarredAction[]): string {
  if (actions.length === 0) return "";
  const items = actions
    .map((a) => {
      const kind =
        a.subType === "reduce" ? "Reduction for" : "Preparation for";
      const risk = a.parentText.trim() || "Untitled risk";
      const body = a.subLine.text.trim() || "(empty)";
      return (
        `<li style="margin:0 0 0.65em 0;list-style-position:outside;">` +
        `<div style="font-weight:600;">${escapeHtml(body)}</div>` +
        `<div style="margin-top:0.2em;color:#3f3f46;font-size:0.92em;line-height:1.35;">` +
        `<span style="font-style:italic;">${escapeHtml(kind)}</span> ` +
        `${escapeHtml(risk)}</div></li>`
      );
    })
    .join("");
  return `<ol style="margin:0.25em 0 0.5em 0;padding-left:1.35em;">${items}</ol>`;
}

/** Inner HTML only (no document wrapper); caller wraps for clipboard. */
export function formatAllForClipboardHtmlInner(
  starred: StarredAction[],
  other: OtherAction[],
): string {
  const starHtml = formatStarredForClipboardHtml(starred);
  const otherNonEmpty = other
    .map((o) => o.text.trim())
    .filter((t) => t.length > 0);
  if (otherNonEmpty.length === 0) return starHtml;

  const otherItems = otherNonEmpty
    .map(
      (t) =>
        `<li style="margin:0 0 0.65em 0;list-style-position:outside;">` +
        `<div style="font-weight:600;">${escapeHtml(t)}</div></li>`,
    )
    .join("");
  let otherBlock =
    `<ol style="margin:0.25em 0 0.5em 0;padding-left:1.35em;">${otherItems}</ol>`;
  if (starred.length > 0) {
    otherBlock =
      `<p style="margin:0 0 0.45em 0;font-weight:600;color:#18181b;">` +
      `${escapeHtml("Other actions:")}</p>` +
      otherBlock;
  }
  if (!starHtml) return otherBlock;
  return `${starHtml}<div style="margin-top:1em;">${otherBlock}</div>`;
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
