import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import RiskMatrix from "./RiskMatrix";
import { installMatrixTestDomPolyfills } from "./testDomPolyfills";

/** End-to-end through the real canvas and toolbar. */

beforeAll(() => {
  installMatrixTestDomPolyfills();
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("Duplicate", () => {
  it("opens a copy of the current matrix and keeps the original", async () => {
    const user = userEvent.setup();
    render(<RiskMatrix />);

    const titleInput = screen.getByLabelText("Matrix title");
    await user.clear(titleInput);
    await user.type(titleInput, "Mine");
    const first = document.querySelector("textarea");
    if (!first) throw new Error("no pool line rendered");
    await user.type(first, "Infiltrator");

    await user.click(screen.getByRole("button", { name: /duplicate/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Matrix title")).toHaveProperty(
        "value",
        "Mine (copy)",
      );
    });
    expect(screen.getAllByDisplayValue("Infiltrator").length).toBeGreaterThan(0);

    const stored = JSON.parse(
      window.localStorage.getItem("riskmatrix.workspace.v1") ?? "{}",
    ) as { saved: { title: string; snapshot: { pool: { text: string }[] } }[] };
    expect(stored.saved.map((s) => s.title).sort()).toEqual([
      "Mine",
      "Mine (copy)",
    ]);
    for (const row of stored.saved) {
      expect(row.snapshot.pool.map((p) => p.text)).toContain("Infiltrator");
    }
  });
});
