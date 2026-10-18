/**
 * Multi-line paste into a single-entry box: each pasted line becomes its own
 * entry, the same as typing the lines with Enter between them.
 */

/** A leading list marker from a pasted bulleted or numbered list: "- ", "• ", "1. ", "2) ". */
const LIST_MARKER = /^(?:[-*•◦‣–]|\d+[.)])\s+/;

export type PasteSplit = {
  /** Text for the box pasted into, then one per new entry after it. */
  texts: string[];
  /** Caret position inside the last entry, just after the pasted text. */
  caret: number;
};

/**
 * Work out the entries a paste produces. Returns null when the pasted text
 * has no line break, so the browser's own paste handles it.
 *
 * Text before the selection stays on the first entry and text after it
 * moves to the last, matching what Enter does at the caret. Blank lines and
 * list markers are dropped, since a pasted list nearly always carries them.
 */
export function splitPastedLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  pasted: string,
): PasteSplit | null {
  if (!/[\r\n]/.test(pasted)) return null;
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const raw = pasted.split(/\r\n|\r|\n/);
  const pieces = raw
    .map((line, i) => {
      if (line.trim() === "") return "";
      // Where the paste continues text already in the box, keep its
      // spacing ("risk" + " one" stays "risk one") and leave it unparsed.
      if (i === 0 && before !== "") return line.trimEnd();
      const cleaned = line.trimStart().replace(LIST_MARKER, "");
      return i === raw.length - 1 && after !== "" ? cleaned : cleaned.trim();
    })
    .filter((line) => line.length > 0);
  if (pieces.length === 0) {
    return { texts: [before + after], caret: before.length };
  }
  const last = pieces.length - 1;
  const texts = pieces.map((piece, i) =>
    (i === 0 ? before : "") + piece + (i === last ? after : ""),
  );
  const caret = (last === 0 ? before.length : 0) + pieces[last].length;
  return { texts, caret };
}

/**
 * Replace the item `id` with one item per text: the original keeps its other
 * fields and takes the first text, and `make` builds the rest.
 */
export function spliceLines<T extends { id: string; text: string }>(
  list: T[],
  id: string,
  texts: string[],
  make: (text: string, index: number) => T,
): T[] {
  const idx = list.findIndex((l) => l.id === id);
  if (idx < 0) return list;
  return [
    ...list.slice(0, idx),
    { ...list[idx], text: texts[0] },
    ...texts.slice(1).map(make),
    ...list.slice(idx + 1),
  ];
}
