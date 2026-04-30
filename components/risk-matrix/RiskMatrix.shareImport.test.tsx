import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SCHEMA_VERSION, generateKey, keyToB64 } from "@/lib/e2ee";
import { __resetRollbackStoreForTests } from "./cloudRollbackStore";
import {
  CloudNotFoundError,
  CloudRollbackError,
  type CloudReadResult,
  type MatrixCloudRepository,
} from "./matrixCloudRepository";
import type { RiskMatrixSnapshot } from "./matrixTypes";

/**
 * Integration test for the share-link import flow.
 *
 * The hook stack under test:
 *   useShareImport() reads window.location → repo.read(handle) → state.
 *   RiskMatrix root branches on that state into:
 *     - loading screen
 *     - SharedMatrixSandboxBanner (sandboxed preview)
 *     - ShareImportFailure (missing / rollback / error)
 *   "Save on this device" calls ws.adoptSharedMatrix and dismisses.
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
  // does not allow assignment to .search/.hash. The hook reads search +
  // hash on mount.
  window.history.replaceState(
    null,
    "",
    `/?matrix=${encodeURIComponent(recordId)}#k=${keyB64}&v=1`,
  );
}

beforeEach(() => {
  __resetRollbackStoreForTests();
  window.localStorage.clear();
  // Cloud feature must be enabled for useShareImport to fire.
  vi.stubEnv("NEXT_PUBLIC_CLOUD_API_URL", "https://api.example");
  // Clean URL between tests.
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
  it("renders the sandbox preview when an inbound share link is present", async () => {
    const key = await generateKey();
    await setShareUrlInLocation(FAKE_RECORD_ID, key);

    mockReadImpl = async () => ({
      snapshot: FAKE_SNAPSHOT,
      title: "A shared matrix",
      version: 3,
      lamport: 2,
      lastWriteDate: "2026-04-29",
      lastReadDate: "2026-04-29",
      createdDate: "2026-04-01",
    });

    const { default: RiskMatrix } = await import("./RiskMatrix");
    render(<RiskMatrix />);

    // Either the loading flash or the banner shows up. Wait for the banner.
    await waitFor(() => {
      expect(screen.getByText(/Viewing shared matrix/i)).toBeTruthy();
    });
    // Title appears both in the banner and the preview heading.
    expect(screen.getAllByText(/A shared matrix/).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("button", { name: /Save on this device/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Dismiss \(don.t save\)/i }),
    ).toBeTruthy();

    // Risk-count summary derived from the decrypted plaintext.
    expect(screen.getByText("Risks in pool")).toBeTruthy();
    // The "2" from FAKE_SNAPSHOT.pool.length appears in the dl.
    const riskCountDt = screen.getByText("Risks in pool");
    const riskCountDd = riskCountDt.nextElementSibling;
    expect(riskCountDd?.textContent).toBe("2");

    // The local library is still empty — sandbox does NOT auto-merge.
    const stored = window.localStorage.getItem("riskmatrix.workspace.v1");
    expect(stored === null || JSON.parse(stored).saved.length === 0).toBe(true);
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
      expect(
        screen.getByText(/no longer available/i),
      ).toBeTruthy();
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

    // We should land on the main canvas, not the sandbox preview or any
    // share-failure screen.
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /risk matrix/i }),
      ).toBeTruthy();
    });
    expect(screen.queryByText(/Viewing shared matrix/i)).toBeNull();
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("'Save on this device' adopts the matrix into the local library and exits the sandbox", async () => {
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

    const user = userEvent.setup();
    const { default: RiskMatrix } = await import("./RiskMatrix");
    render(<RiskMatrix />);

    await waitFor(() => {
      expect(screen.getByText(/Viewing shared matrix/i)).toBeTruthy();
    });

    const saveBtn = screen.getByRole("button", { name: /Save on this device/i });
    await user.click(saveBtn);

    // Sandbox is gone — banner no longer rendered.
    await waitFor(() => {
      expect(screen.queryByText(/Viewing shared matrix/i)).toBeNull();
    });

    // The adopted matrix is now in localStorage.
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
  });

  it("'Dismiss' clears the share params from the URL without writing anything", async () => {
    const key = await generateKey();
    await setShareUrlInLocation(FAKE_RECORD_ID, key);
    mockReadImpl = async () => ({
      snapshot: FAKE_SNAPSHOT,
      title: "x",
      version: 1,
      lamport: 1,
      lastWriteDate: null,
      lastReadDate: null,
      createdDate: null,
    });

    const user = userEvent.setup();
    const { default: RiskMatrix } = await import("./RiskMatrix");
    render(<RiskMatrix />);

    await waitFor(() => {
      expect(screen.getByText(/Viewing shared matrix/i)).toBeTruthy();
    });

    const dismissBtn = screen.getByRole("button", { name: /Dismiss/i });
    await user.click(dismissBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Viewing shared matrix/i)).toBeNull();
    });

    // URL no longer carries the share params.
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");

    // localStorage was not seeded with the dismissed matrix.
    const stored = window.localStorage.getItem("riskmatrix.workspace.v1");
    if (stored) {
      const parsed = JSON.parse(stored) as { saved?: unknown[] };
      expect(parsed.saved?.length ?? 0).toBe(0);
    }
  });
});

// Suppress the "unused" lint warning for the schemaVersion import — it's a
// useful re-export we want kept in scope for any future test additions.
void SCHEMA_VERSION;
