import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RiskMatrix from "./RiskMatrix";

describe("RiskMatrix", () => {
  it("renders the app logo in the top-left of the title row", () => {
    render(<RiskMatrix />);
    // The text heading "risk matrix" was replaced with the SVG logo
    // (alt="Risk matrix"). Match the image instead so this stays
    // truthy after the swap.
    expect(
      screen.getByRole("img", { name: /risk matrix/i }),
    ).toBeTruthy();
  });
});
