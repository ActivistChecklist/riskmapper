import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import RiskMatrix from "./RiskMatrix";
import { MATRIX_FILE_FORMAT } from "./matrixFile";
import { installMatrixTestDomPolyfills } from "./testDomPolyfills";

/**
 * End-to-end through the real canvas: a matrix downloaded as a file comes
 * back as its own saved matrix, and the round trip never touches the
 * network.
 */

beforeAll(() => {
  installMatrixTestDomPolyfills();
});

beforeEach(() => {
  window.localStorage.clear();
});

async function renameMatrix(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
) {
  const input = screen.getByLabelText("Matrix title");
  await user.clear(input);
  await user.type(input, title);
}

/** Type into the first pool line (the first textarea on the page). */
async function addPoolRisk(
  user: ReturnType<typeof userEvent.setup>,
  text: string,
) {
  const first = document.querySelector("textarea");
  if (!first) throw new Error("no pool line rendered");
  await user.type(first, text);
}

function storedTitles(): string[] {
  const stored = JSON.parse(
    window.localStorage.getItem("riskmatrix.workspace.v1") ?? "{}",
  ) as { saved?: { title: string }[] };
  return (stored.saved ?? []).map((s) => s.title);
}

/** Wait for the confirmation dialog, then accept it. */
async function confirmImport(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole("dialog", { name: /import this matrix/i });
  await user.click(within(dialog).getByRole("button", { name: "Import" }));
}

function matrixFile(name: string, body: Record<string, unknown>): File {
  return new File(
    [JSON.stringify({ format: MATRIX_FILE_FORMAT, version: 1, ...body })],
    name,
    { type: "application/json" },
  );
}

describe("matrix file import", () => {
  it("opens an imported file as a new saved matrix, keeping the draft", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<RiskMatrix />);

    await renameMatrix(user, "Mine");
    await addPoolRisk(user, "Infiltrator");

    await user.upload(
      screen.getByTestId("matrix-file-input"),
      matrixFile("plan.json", {
        title: "Their plan",
        risks: [
          {
            text: "Phone seized",
            likelihood: "high",
            impact: "high",
            reductions: [{ text: "Leave it at home", starred: true }],
          },
        ],
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: /import this matrix/i });
    expect(within(dialog).getByText(/1 risk on the matrix/)).toBeTruthy();
    expect(within(dialog).getByText(/1 mitigation, 1 starred/)).toBeTruthy();
    // Nothing is stored until the user confirms.
    expect(storedTitles()).not.toContain("Their plan");
    await confirmImport(user);

    await waitFor(() => {
      expect(screen.getByLabelText("Matrix title")).toHaveProperty(
        "value",
        "Their plan",
      );
    });
    expect(screen.getAllByDisplayValue("Phone seized").length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("Leave it at home").length).toBeGreaterThan(0);

    const stored = JSON.parse(
      window.localStorage.getItem("riskmatrix.workspace.v1") ?? "{}",
    ) as { saved: { title: string; cloud?: unknown }[] };
    const titles = stored.saved.map((s) => s.title);
    expect(titles).toContain("Their plan");
    expect(titles).toContain("Mine");
    expect(stored.saved.every((s) => s.cloud === undefined)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does not save an empty draft when importing", async () => {
    const user = userEvent.setup();
    render(<RiskMatrix />);
    await user.upload(
      screen.getByTestId("matrix-file-input"),
      matrixFile("plan.json", { title: "Their plan" }),
    );
    await confirmImport(user);
    await waitFor(() => {
      expect(screen.getByLabelText("Matrix title")).toHaveProperty(
        "value",
        "Their plan",
      );
    });
    expect(storedTitles()).toEqual(["Their plan"]);
  });

  it("leaves the current matrix open when the file is not a matrix", async () => {
    const user = userEvent.setup();
    render(<RiskMatrix />);
    await renameMatrix(user, "Mine");

    await user.upload(
      screen.getByTestId("matrix-file-input"),
      new File(["not json"], "notes.json", { type: "application/json" }),
    );

    // Give the async file read a chance to (not) switch matrices.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByLabelText("Matrix title")).toHaveProperty("value", "Mine");
  });

  it("imports nothing when the user cancels", async () => {
    const user = userEvent.setup();
    render(<RiskMatrix />);
    await renameMatrix(user, "Mine");
    await user.upload(
      screen.getByTestId("matrix-file-input"),
      matrixFile("plan.json", { title: "Their plan" }),
    );
    const dialog = await screen.findByRole("dialog", { name: /import this matrix/i });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Matrix title")).toHaveProperty("value", "Mine");
    expect(storedTitles()).not.toContain("Their plan");
  });

  it("renames a file that would look like an existing matrix, and warns about links", async () => {
    const user = userEvent.setup();
    render(<RiskMatrix />);
    await renameMatrix(user, "Mine");
    await addPoolRisk(user, "Infiltrator");
    await user.upload(
      screen.getByTestId("matrix-file-input"),
      matrixFile("plan.json", {
        title: "Mine",
        unplacedRisks: ["Report at https://example.com"],
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: /import this matrix/i });
    expect(within(dialog).getByText(/Mine \(imported\)/)).toBeTruthy();
    expect(within(dialog).getByText(/Contains 1 web link/)).toBeTruthy();
    await confirmImport(user);
    await waitFor(() => {
      expect(screen.getByLabelText("Matrix title")).toHaveProperty(
        "value",
        "Mine (imported)",
      );
    });
    expect(storedTitles().sort()).toEqual(["Mine", "Mine (imported)"]);
  });

  it("changes nothing when browser storage is full", async () => {
    const user = userEvent.setup();
    render(<RiskMatrix />);
    await renameMatrix(user, "Mine");
    await addPoolRisk(user, "Infiltrator");
    await user.upload(
      screen.getByTestId("matrix-file-input"),
      matrixFile("plan.json", { title: "Their plan" }),
    );
    await screen.findByRole("dialog", { name: /import this matrix/i });
    const before = window.localStorage.getItem("riskmatrix.workspace.v1");
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("full", "QuotaExceededError");
      });
    await confirmImport(user);
    await new Promise((r) => setTimeout(r, 20));
    setItem.mockRestore();
    expect(screen.getByLabelText("Matrix title")).toHaveProperty("value", "Mine");
    expect(screen.getAllByDisplayValue("Infiltrator").length).toBeGreaterThan(0);
    expect(window.localStorage.getItem("riskmatrix.workspace.v1")).toBe(before);
  });
});
