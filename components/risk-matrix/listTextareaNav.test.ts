import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  handleListVerticalArrows,
  isArrowWithSelectionOrOsShortcut,
} from "./listTextareaNav";

describe("listTextareaNav", () => {
  it("detects OS / selection arrow shortcuts", () => {
    expect(
      isArrowWithSelectionOrOsShortcut({
        shiftKey: true,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      } as KeyboardEvent),
    ).toBe(true);
  });

  it("moves focus on arrow down within a list", () => {
    const focus = vi.fn();
    const lines = [
      { id: "a", text: "hi" },
      { id: "b", text: "" },
    ];
    const el = document.createElement("textarea");
    el.value = "hi";
    el.selectionStart = 2;
    el.selectionEnd = 2;
    const e = {
      key: "ArrowDown",
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      target: el,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent<HTMLTextAreaElement>;

    const ok = handleListVerticalArrows(e, lines, "a", focus);
    expect(ok).toBe(true);
    expect(focus).toHaveBeenCalledWith("b", 0);
  });
});
