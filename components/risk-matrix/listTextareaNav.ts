import type { KeyboardEvent } from "react";

/** Shift/Cmd/Ctrl/Alt + arrows: native selection & OS shortcuts, not cross-line focus. */
export function isArrowWithSelectionOrOsShortcut(
  e: KeyboardEvent,
): boolean {
  return e.shiftKey || e.metaKey || e.ctrlKey || e.altKey;
}

export type TextLineRef = { id: string; text: string };

/**
 * Shared pool / matrix risk / other-action / mitigation sub-line behavior:
 * Arrow up/down moves between rows when the caret is not crossing an explicit newline.
 */
export function handleListVerticalArrows(
  e: KeyboardEvent<HTMLTextAreaElement>,
  lines: TextLineRef[],
  currentId: string,
  focusById: (id: string, caret?: number) => void,
): boolean {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return false;
  if (isArrowWithSelectionOrOsShortcut(e)) return false;
  const el = e.target as HTMLTextAreaElement;
  const caret = el.selectionStart ?? 0;
  const idx = lines.findIndex((l) => l.id === currentId);
  if (idx < 0) return false;

  if (e.key === "ArrowUp") {
    const before = el.value.substring(0, caret);
    if (before.includes("\n")) return false;
    if (idx > 0) {
      e.preventDefault();
      const target = lines[idx - 1];
      focusById(target.id, target.text.length);
      return true;
    }
    return false;
  }

  const after = el.value.substring(caret);
  if (after.includes("\n")) return false;
  if (idx < lines.length - 1) {
    e.preventDefault();
    const target = lines[idx + 1];
    focusById(target.id, 0);
    return true;
  }
  return false;
}
