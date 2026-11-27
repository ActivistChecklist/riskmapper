import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SaveReminder, { SAVE_REMINDER } from "./SaveReminder";

describe("SaveReminder", () => {
  it("says to save a copy, beside whatever export control it is given", () => {
    render(<SaveReminder exportMenu={<button type="button">Export</button>} />);
    const block = screen.getByRole("region", { name: "Save your plan" });
    expect(block.textContent).toContain(SAVE_REMINDER);
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });
});
