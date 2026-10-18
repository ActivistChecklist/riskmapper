import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  INITIAL_CATEGORIZED_REVEAL_HIDDEN,
  INITIAL_COLLAPSED,
} from "./constants";
import { seedYDoc } from "./matrixYDoc";
import type {
  MatrixWorkspaceV1,
  RiskMatrixSnapshot,
  StoredMatrix,
} from "./matrixTypes";
import { emptyGrid } from "./riskMatrixUtils";
import { installMatrixTestDomPolyfills } from "./testDomPolyfills";

/**
 * Duplicating a shared matrix must not carry its share setting, and that
 * includes the address bar: the copy is not shared, so leaving the
 * original's share link there would invite pasting the original's link
 * while believing it points at the copy.
 *
 * useCloudMatrix is stubbed with a real, seeded Y.Doc so the shared
 * surface mounts without a server.
 */

const cloudStub = vi.hoisted(() => ({
  doc: null as import("yjs").Doc | null,
  // Stable like the real one: a new object each render would re-run the
  // share importer against the share link this test puts in the URL.
  repo: {},
}));

vi.mock("./useCloudMatrix", () => ({
  useCloudMatrix: (activeMeta: unknown) => ({
    syncState: { kind: "idle" },
    repo: cloudStub.repo,
    doc: activeMeta ? cloudStub.doc : null,
    flush: async () => {},
    cancel: () => {},
    acknowledge: () => {},
    reopenAction: () => {},
  }),
}));

// Imported after the mock is registered.
const { default: RiskMatrix } = await import("./RiskMatrix");

const STORAGE_KEY = "riskmatrix.workspace.v1";

function snapshot(): RiskMatrixSnapshot {
  return {
    pool: [{ id: "rm-ln-i-1", text: "Phone seized" }],
    grid: emptyGrid(),
    collapsed: { ...INITIAL_COLLAPSED },
    otherActions: [],
    hiddenCategorizedRiskKeys: [],
    categorizedRevealHidden: { ...INITIAL_CATEGORIZED_REVEAL_HIDDEN },
    notes: "",
  };
}

function storedRows(): StoredMatrix[] {
  return (
    JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as {
      saved: StoredMatrix[];
    }
  ).saved;
}

beforeAll(() => {
  installMatrixTestDomPolyfills();
});

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  const ws: MatrixWorkspaceV1 = {
    v: 1,
    activeKind: "saved",
    activeSavedId: "row-1",
    defaultSnapshot: null,
    draftTitle: "Draft",
    saved: [
      {
        id: "row-1",
        title: "Shared plan",
        updatedAt: new Date(0).toISOString(),
        snapshot: snapshot(),
        cloud: {
          recordId: "rec-1",
          keyB64: "k".repeat(43),
          lastHeadSeq: 0,
          yDocStateB64: "",
        },
      },
    ],
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
  const doc = new Y.Doc();
  seedYDoc(doc, { title: "Shared plan", snapshot: snapshot() });
  cloudStub.doc = doc;
});

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  cloudStub.doc = null;
});

describe("Duplicate on a shared matrix", () => {
  it("opens an unshared copy and takes the share link out of the address bar", async () => {
    const user = userEvent.setup();
    render(<RiskMatrix />);
    await waitFor(() => {
      expect(window.location.pathname).toBe("/grid/rec-1");
    });

    await user.click(screen.getByRole("button", { name: /duplicate/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Matrix title")).toHaveProperty(
        "value",
        "Shared plan (copy)",
      );
    });
    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    expect(window.location.hash).toBe("");

    const rows = storedRows();
    expect(rows.find((r) => r.title === "Shared plan")?.cloud?.recordId).toBe(
      "rec-1",
    );
    const copy = rows.find((r) => r.title === "Shared plan (copy)");
    expect(copy?.cloud).toBeUndefined();
    expect(copy?.snapshot.pool.map((p) => p.text)).toContain("Phone seized");
  });
});
