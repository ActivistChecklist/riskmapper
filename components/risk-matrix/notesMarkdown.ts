/**
 * Tiny CommonMark subset used by the notes editor: H1–H3, bold/italic,
 * inline code, autolinks, `[text](url)` links, and ordered/unordered lists.
 * Anything else falls through as plain text.
 *
 * Shared between the PDF document renderer (react-pdf) and the rich-text
 * clipboard exporter (HTML). Both consume the same `NotesBlock[]` AST.
 */

export type NotesInline =
  | {
      kind: "text";
      text: string;
      bold?: boolean;
      italic?: boolean;
      code?: boolean;
    }
  | { kind: "link"; text: string; href: string };

export type NotesBlock =
  | { kind: "h1" | "h2" | "h3" | "p"; inlines: NotesInline[] }
  | { kind: "ul" | "ol"; items: NotesInline[][] };

const INLINE_TOKEN_RE =
  /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g;

function parseInlines(line: string): NotesInline[] {
  const out: NotesInline[] = [];
  let cursor = 0;
  for (const m of line.matchAll(INLINE_TOKEN_RE)) {
    const start = m.index ?? 0;
    if (start > cursor) {
      out.push({ kind: "text", text: line.slice(cursor, start) });
    }
    const tok = m[0];
    if (tok.startsWith("**") || tok.startsWith("__")) {
      out.push({ kind: "text", text: tok.slice(2, -2), bold: true });
    } else if (tok.startsWith("`")) {
      out.push({ kind: "text", text: tok.slice(1, -1), code: true });
    } else if (tok.startsWith("[")) {
      const close = tok.indexOf("]");
      out.push({
        kind: "link",
        text: tok.slice(1, close),
        href: tok.slice(close + 2, -1),
      });
    } else if (/^https?:\/\//.test(tok)) {
      out.push({ kind: "link", text: tok, href: tok });
    } else if (tok.startsWith("*") || tok.startsWith("_")) {
      out.push({ kind: "text", text: tok.slice(1, -1), italic: true });
    }
    cursor = start + tok.length;
  }
  if (cursor < line.length) {
    out.push({ kind: "text", text: line.slice(cursor) });
  }
  return out;
}

export function parseNotesMarkdown(md: string): NotesBlock[] {
  // The notes editor serializes empty paragraphs as NBSP-only lines so
  // multi-line structure survives the CommonMark blank-line collapse on
  // parse. Treat them as blank for block splitting.
  const normalized = md.replace(/^[\s ]+$/gm, "");
  const blocks: NotesBlock[] = [];
  const lines = normalized.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().length === 0) {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length as 1 | 2 | 3;
      blocks.push({
        kind: `h${level}` as "h1" | "h2" | "h3",
        inlines: parseInlines(h[2].trim()),
      });
      i++;
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      const isOrdered = !!ol;
      const items: NotesInline[][] = [];
      while (i < lines.length) {
        const u = /^[-*]\s+(.*)$/.exec(lines[i]);
        const o = /^\d+\.\s+(.*)$/.exec(lines[i]);
        if (isOrdered ? !o : !u) break;
        items.push(parseInlines((isOrdered ? o![1] : u![1]).trim()));
        i++;
      }
      blocks.push({ kind: isOrdered ? "ol" : "ul", items });
      continue;
    }
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      if (next.trim().length === 0) break;
      if (/^(#{1,3})\s+/.test(next)) break;
      if (/^[-*]\s+/.test(next) || /^\d+\.\s+/.test(next)) break;
      paraLines.push(next);
      i++;
    }
    blocks.push({
      kind: "p",
      inlines: parseInlines(paraLines.join(" ").trim()),
    });
  }
  return blocks;
}
