import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CountBadge from "./CountBadge";

describe("CountBadge", () => {
  it("shows the bare number, without parentheses", () => {
    render(<CountBadge count={3} />);
    expect(screen.getByText("3").textContent).toBe("3");
  });

  it("darkens the teal strip instead of lightening it", () => {
    // Light text on a lighter pill would drop below AA contrast at 12px.
    render(<CountBadge count={0} variant="onPrimary" />);
    expect(screen.getByText("0").className).toContain("bg-black/20");
  });
});
