import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import RiskMatrix from "./RiskMatrix";
import { STEP_TITLES } from "./guidance/guidanceCopy";

/** The closest ancestor that holds `text`: the step header the button sits in. */
function headerHolding(el: HTMLElement, text: string): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && !node.textContent?.includes(text)) node = node.parentElement;
  return node;
}

describe("step Copy buttons", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("are each named for what they copy, in their own step's header", () => {
    // Below sm only the icon shows, so the name is all a screen reader
    // has to tell the four apart.
    render(<RiskMatrix />);
    const steps = [
      { step: 1, name: "Copy risk pool" },
      { step: 2, name: "Copy matrix" },
      { step: 3, name: "Copy resources" },
      { step: 4, name: "Copy all mitigations" },
    ] as const;
    for (const { step, name } of steps) {
      const button = screen.getByRole("button", { name });
      const header = headerHolding(button, STEP_TITLES[step]);
      expect(header).not.toBeNull();
      // The nearest holder is that step's header, not a wrapper around
      // several steps.
      for (const other of [1, 2, 3, 4] as const) {
        if (other === step) continue;
        expect(header?.textContent?.includes(STEP_TITLES[other])).toBe(false);
      }
    }
    expect(screen.queryAllByRole("button", { name: "Copy" })).toHaveLength(0);
  });
});
