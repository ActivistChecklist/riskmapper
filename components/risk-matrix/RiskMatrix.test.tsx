import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RiskMatrix from "./RiskMatrix";

describe("RiskMatrix", () => {
  it("renders the app logo in the top-left of the title row", () => {
    render(<RiskMatrix />);
    // The text heading was replaced with the SVG logo (alt="Risk
    // Mapper", driven by SITE_NAME in MatrixTopBar). Match the image
    // by name so this stays truthy.
    expect(
      screen.getByRole("img", { name: /risk mapper/i }),
    ).toBeTruthy();
  });
});
