import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { generateKey, keyToB64 } from "@/lib/e2ee";
import { __resetRollbackStoreForTests } from "./cloudRollbackStore";
import {
  CloudNotFoundError,
  CloudRollbackError,
  type CloudReadResult,
  type MatrixCloudRepository,
} from "./matrixCloudRepository";
import type { RiskMatrixSnapshot } from "./matrixTypes";

/**
 * Integration test for the share-link import flow (auto-adopt model).
 *
 * The hook stack under test:
 *   useShareImport() reads window.location → repo.read(handle) → state.
 *   RiskMatrix root branches on that state:
 *     - "loading" / "ready" → loading screen, then auto-adopt + render canvas
 *     - "missing" / "rollback" / "error" → ShareImportFailure screen
 *
 * No sandbox preview, no "Save on this device" gesture — we trust the link
 * the user clicked.
 *
 * We mock `createMatrixCloudRepository` so no fetch goes out and the test
 * controls exactly what `repo.read` returns.
 */

const FAKE_RECORD_ID = "abcd1234efgh5678ijkl";
const FAKE_SNAPSHOT: RiskMatrixSnapshot = {
  pool: [
    { id: "p1", text: "first risk" },
    { id: "p2", text: "second risk" },
  ],
  grid: {},
  collapsed: { red: false, orange: false, yellow: false, green: false },
  hasCompletedFirstDragToMatrix: false,
  otherActions: [],
  hiddenCategorizedRiskKeys: [],
  categorizedRevealHidden: { red: false, orange: false, yellow: false, green: false },
};

// Module-level holders the mock factory closes over. Tests overwrite
// `mockReadImpl` per-case to control the share-fetch outcome.
let mockReadImpl: () => Promise<CloudReadResult> = async () => {
  throw new Error("mockReadImpl not set");
};
const mockedRepo: MatrixCloudRepository = {
  create: vi.fn(),
  read: vi.fn(() => mockReadImpl()) as MatrixCloudRepository["read"],
  write: vi.fn(),
  delete: vi.fn(),
};

vi.mock("./matrixCloudRepository", async (importActual) => {
  const actual = await importActual<typeof import("./matrixCloudRepository")>();
  return {
    ...actual,
    createMatrixCloudRepository: () => mockedRepo,
  };
});

async function setShareUrlInLocation(recordId: string, key: Uint8Array) {
  const keyB64 = keyToB64(key);
  // Use replaceState rather than mutating window.location directly — JSDOM
  // does not allow assignment to .pathname/.hash. The hook reads them on
  // mount.
  window.history.replaceState(null, "", `/grid/${encodeURIComponent(recordId)}#${keyB64}`);
}

beforeEach(() => {
  __resetRollbackStoreForTests();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  __resetRollbackStoreForTests();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("share-link import flow", () => {
  it("auto-adopts the matrix into the local library on a /grid/ link", async () => {
    const key = await generateKey();
    await setShareUrlInLocation(FAKE_RECORD_ID, key);
    mockReadImpl = async () => ({
      snapshot: FAKE_SNAPSHOT,
      title: "Adopted matrix",
      version: 3,
      lamport: 2,
      lastWriteDate: "2026-04-29",
      lastReadDate: "2026-04-29",
      createdDate: "2026-04-01",
    });

    const { default: RiskMatrix } = await import("./RiskMatrix");
    render(<RiskMatrix />);

    // Adoption happens on first render after the read resolves; the canvas
    // renders the heading once we land on the SPA surface.
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /risk matrix/i }),
      ).toBeTruthy();
    });

    const stored = JSON.parse(
      window.localStorage.getItem("riskmatrix.workspace.v1") ?? "null",
    ) as {
      saved?: Array<{
        title: string;
        cloud?: { recordId: string; keyB64: string; lastSyncedVersion: number; lastSyncedLamport: number };
      }>;
    } | null;
    expect(stored).not.toBeNull();
    expect(stored?.saved?.length).toBe(1);
    const saved = stored!.saved![0];
    expect(saved.title).toBe("Adopted matrix");
    expect(saved.cloud?.recordId).toBe(FAKE_RECORD_ID);
    expect(saved.cloud?.keyB64).toBe(keyToB64(key));
    expect(saved.cloud?.lastSyncedVersion).toBe(3);
    expect(saved.cloud?.lastSyncedLamport).toBe(2);

    // URL is cleaned so a refresh doesn't re-trigger the import.
    expect(window.location.pathname).toBe("/");
    expect(window.location.hash).toBe("");
  });

  it("dedupes when the recordId is already in the local library", async () => {
    const key = await generateKey();
    await setShareUrlInLocation(FAKE_RECORD_ID, key);
    // Pre-seed localStorage with an existing saved row that already has
    // this cloud recordId.
    window.localStorage.setItem(
      "riskmatrix.workspace.v1",
      JSON.stringify({
        v: 1,
        activeKind: "default",
        activeSavedId: null,
        defaultSnapshot: null,
        draftTitle: "Untitled",
        saved: [
          {
            id: "local-id-1",
            title: "Already here",
            updatedAt: "2026-04-01T00:00:00Z",
            snapshot: FAKE_SNAPSHOT,
            cloud: {
              recordId: FAKE_RECORD_ID,
              keyB64: keyToB64(key),
              lastSyncedVersion: 2,
              lastSyncedLamport: 1,
            },
          },
        ],
      }),
    );
    mockReadImpl = async () => ({
      snapshot: FAKE_SNAPSHOT,
      title: "Newer name",
      version: 3,
      lamport: 2,
      lastWriteDate: null,
      lastReadDate: null,
      createdDate: null,
    });

    const { default: RiskMatrix } = await import("./RiskMatrix");
    render(<RiskMatrix />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /risk matrix/i }),
      ).toBeTruthy();
    });

    // Still exactly one saved row (no duplicate).
    const stored = JSON.parse(
      window.localStorage.getItem("riskmatrix.workspace.v1") ?? "null",
    ) as { saved?: unknown[]; activeSavedId?: string };
    expect(stored?.saved?.length).toBe(1);
    expect(stored?.activeSavedId).toBe("local-id-1");
  });

  it("shows a friendly 'no longer available' screen when read returns 404", async () => {
    const key = await generateKey();
    await setShareUrlInLocation(FAKE_RECORD_ID, key);
    mockReadImpl = async () => {
      throw new CloudNotFoundError();
    };

    const { default: RiskMatrix } = await import("./RiskMatrix");
    render(<RiskMatrix />);

    await waitFor(() => {
      expect(screen.getByText(/no longer available/i)).toBeTruthy();
    });
    expect(
      screen.getByRole("button", { name: /Continue without it/i }),
    ).toBeTruthy();
  });

  it("shows a friendly rollback screen with non-jargon copy", async () => {
    const key = await generateKey();
    await setShareUrlInLocation(FAKE_RECORD_ID, key);
    mockReadImpl = async () => {
      throw new CloudRollbackError("server returned an older version");
    };

    const { default: RiskMatrix } = await import("./RiskMatrix");
    render(<RiskMatrix />);

    await waitFor(() => {
      expect(
        screen.getByText(/may be older than what you saw before/i),
      ).toBeTruthy();
    });
    // The raw exception message is NOT shown — we want user-facing copy only.
    expect(screen.queryByText(/server returned an older version/i)).toBeNull();
  });

  it("does NOT fire when cloud sync is explicitly disabled", async () => {
    const key = await generateKey();
    await setShareUrlInLocation(FAKE_RECORD_ID, key);
    vi.stubEnv("NEXT_PUBLIC_CLOUD_SYNC_ENABLED", "false");
    const readSpy = vi.fn();
    mockReadImpl = async () => {
      readSpy();
      throw new Error("should not be called");
    };

    const { default: RiskMatrix } = await import("./RiskMatrix");
    render(<RiskMatrix />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /risk matrix/i }),
      ).toBeTruthy();
    });
    expect(readSpy).not.toHaveBeenCalled();
  });
});
