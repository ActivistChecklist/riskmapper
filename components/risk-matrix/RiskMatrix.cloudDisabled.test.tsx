import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INITIAL_CATEGORIZED_REVEAL_HIDDEN,
  INITIAL_COLLAPSED,
} from "./constants";
import type { MatrixWorkspaceV1, RiskMatrixSnapshot } from "./matrixTypes";
import { emptyGrid } from "./riskMatrixUtils";
import { installMatrixTestDomPolyfills } from "./testDomPolyfills";

/**
 * With cloud sync off, as in the offline file, a stored row's share
 * metadata must be ignored. In the offline file such a row can only come
 * from storage another page wrote (Chromium shares one storage area across
 * every HTML file opened from disk), and honouring it would try to open a
 * connection and rewrite a file: URL, which throws.
 */

const cloudCalls = vi.hoisted(() => ({ metas: [] as unknown[] }));

vi.mock("./useCloudMatrix", () => ({
  useCloudMatrix: (activeMeta: unknown) => {
    cloudCalls.metas.push(activeMeta);
    return {
      syncState: { kind: "idle" },
      repo: {},
      doc: null,
      flush: async () => {},
      cancel: () => {},
      acknowledge: () => {},
      reopenAction: () => {},
    };
  },
}));

const { default: RiskMatrix } = await import("./RiskMatrix");

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

beforeAll(() => {
  installMatrixTestDomPolyfills();
});

beforeEach(() => {
  vi.stubEnv("VITE_CLOUD_SYNC_ENABLED", "false");
  cloudCalls.metas = [];
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
        title: "Planted share",
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
  window.localStorage.setItem("riskmatrix.workspace.v1", JSON.stringify(ws));
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("RiskMatrix with cloud sync off", () => {
  it("ignores a stored row's share metadata", async () => {
    render(<RiskMatrix />);
    await waitFor(() => {
      expect(screen.getByLabelText("Matrix title")).toHaveProperty("value", "Planted share");
    });

    // Never asked to connect, never wrote a share link, and says so.
    expect(cloudCalls.metas.length).toBeGreaterThan(0);
    expect(cloudCalls.metas.every((m) => m === null)).toBe(true);
    expect(window.location.pathname).toBe("/");
    expect(screen.getByRole("button", { name: /saved locally/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /end-to-end encrypted/i })).toBe(null);
  });
});
