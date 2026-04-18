import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RiskMatrix from "./RiskMatrix";

describe("RiskMatrix", () => {
  it("renders the main heading", () => {
    render(<RiskMatrix />);
    expect(
      screen.getByRole("heading", { name: /risk matrix/i }),
    ).toBeTruthy();
  });
});
