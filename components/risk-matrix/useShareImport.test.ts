import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { generateKey, keyToB64 } from "@/lib/e2ee";
import {
  CloudNotFoundError,
  type CloudMatrixHandle,
  type CloudReadResult,
  type MatrixCloudRepository,
} from "./matrixCloudRepository";
import { seedYDoc } from "./matrixYDoc";
import type { RiskMatrixSnapshot } from "./matrixTypes";
import { useShareImport } from "./useShareImport";

/**
 * The share-link import flow. This hook is the app's only consumer of
 * `window.location.pathname`, so it's the piece most exposed to a router
 * change: today Next gives `/grid/[id]` a real route, and under a static
 * build the same URL has to reach the SPA via a server fallback. These
 * tests assert the behaviour that has to hold either way.
 *
 * Every case builds its repo once and passes a stable reference, because
 * the import effect keys on `repo` identity. That mirrors the app, where
 * `useCloudMatrix` memoizes it — a fresh object per render would refetch
 * in a loop.
 */

const RECORD_ID = "abc123def456ghij";

const SNAPSHOT: RiskMatrixSnapshot = {
  pool: [{ id: "p-1", text: "Shared pool risk" }],
  grid: { "1-1": [{ id: "g-1", text: "Shared grid risk" }] },
  collapsed: { red: false, orange: false, yellow: true, green: false },
  otherActions: [{ id: "o-1", text: "shared action" }],
  hiddenCategorizedRiskKeys: [],
  categorizedRevealHidden: { red: false, orange: false, yellow: false, green: false },
  notes: "shared notes",
};

function seededDoc(): Y.Doc {
  const doc = new Y.Doc();
  seedYDoc(doc, { title: "Shared matrix", snapshot: SNAPSHOT });
  return doc;
}

function readResult(doc: Y.Doc, headSeq = 3): CloudReadResult {
  return {
    baseline: Y.encodeStateAsUpdate(doc),
    baselineSeq: 0,
    headSeq,
    updates: [],
    lastWriteDate: null,
    lastReadDate: null,
    createdDate: null,
  };
}

/** Minimal repo — the hook only ever calls `read`. */
function fakeRepo(read: MatrixCloudRepository["read"]): MatrixCloudRepository {
  return { read } as unknown as MatrixCloudRepository;
}

async function setShareLocation(key: Uint8Array, recordId = RECORD_ID) {
  window.history.replaceState(
    null,
    "",
    `/grid/${recordId}#${await keyToB64(key)}`,
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("useShareImport", () => {
  it("stays idle on a normal, non-share URL", async () => {
    const read = vi.fn();
    const repo = fakeRepo(read);
    const { result } = renderHook(() => useShareImport({ repo }));

    await waitFor(() => expect(result.current.state.kind).toBe("idle"));
    expect(read).not.toHaveBeenCalled();
  });

  it("stays idle when disabled, even on a share URL", async () => {
    const key = await generateKey();
    await setShareLocation(key);
    const read = vi.fn();
    const repo = fakeRepo(read);

    const { result } = renderHook(() =>
      useShareImport({ repo, enabled: false }),
    );

    await waitFor(() => expect(result.current.state.kind).toBe("idle"));
    expect(read).not.toHaveBeenCalled();
  });

  it("stays idle when the fragment is missing the key", async () => {
    window.history.replaceState(null, "", `/grid/${RECORD_ID}`);
    const read = vi.fn();
    const repo = fakeRepo(read);

    const { result } = renderHook(() => useShareImport({ repo }));

    await waitFor(() => expect(result.current.state.kind).toBe("idle"));
    expect(read).not.toHaveBeenCalled();
  });

  it("reads the record once, with the id from the path and the key from the fragment", async () => {
    const key = await generateKey();
    await setShareLocation(key);
    const doc = seededDoc();
    const read = vi.fn<MatrixCloudRepository["read"]>(async () =>
      readResult(doc),
    );
    const repo = fakeRepo(read);

    const { result } = renderHook(() => useShareImport({ repo }));

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    // Exactly once: a re-fetch per render would hammer the API.
    expect(read).toHaveBeenCalledTimes(1);
    const handle: CloudMatrixHandle = read.mock.calls[0][0];
    expect(handle.recordId).toBe(RECORD_ID);
    expect(handle.key).toEqual(key);
  });

  it("resolves to ready with the decoded title, snapshot and head sequence", async () => {
    const key = await generateKey();
    await setShareLocation(key);
    const doc = seededDoc();
    const repo = fakeRepo(async () => readResult(doc, 7));

    const { result } = renderHook(() => useShareImport({ repo }));

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    if (result.current.state.kind !== "ready") throw new Error("unreachable");
    const { result: imported, keyB64, fingerprint } = result.current.state;

    expect(imported.title).toBe("Shared matrix");
    expect(imported.snapshot.pool).toEqual(SNAPSHOT.pool);
    expect(imported.snapshot.grid).toEqual(SNAPSHOT.grid);
    expect(imported.snapshot.notes).toBe("shared notes");
    expect(imported.headSeq).toBe(7);
    expect(imported.yDocState.byteLength).toBeGreaterThan(0);
    expect(keyB64).toBe(await keyToB64(key));
    expect(fingerprint).toBe(keyB64.slice(-6));
  });

  it("opens every category on import so nothing arrives hidden", async () => {
    const key = await generateKey();
    await setShareLocation(key);
    const doc = seededDoc();
    const repo = fakeRepo(async () => readResult(doc));

    const { result } = renderHook(() => useShareImport({ repo }));

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    if (result.current.state.kind !== "ready") throw new Error("unreachable");
    // The seeded snapshot collapses yellow; an imported copy must not
    // inherit that, or a recipient can open a link and see nothing.
    expect(result.current.state.result.snapshot.collapsed).toEqual({
      red: false,
      orange: false,
      yellow: false,
      green: false,
    });
    expect(result.current.state.result.snapshot.categorizedRevealHidden).toEqual({
      red: false,
      orange: false,
      yellow: false,
      green: false,
    });
  });

  it("applies incremental updates on top of the baseline", async () => {
    const key = await generateKey();
    await setShareLocation(key);
    const doc = seededDoc();
    const baseline = Y.encodeStateAsUpdate(doc);

    // A later edit, delivered as an update rather than in the baseline.
    const editor = new Y.Doc();
    Y.applyUpdate(editor, baseline);
    const before = Y.encodeStateVector(editor);
    editor.getMap("matrix").set("title", "Renamed after sharing");
    const delta = Y.encodeStateAsUpdate(editor, before);

    const repo = fakeRepo(async () => ({
      ...readResult(doc),
      updates: [{ seq: 1, bytes: delta, clientId: "other" }],
    }));

    const { result } = renderHook(() => useShareImport({ repo }));

    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    if (result.current.state.kind !== "ready") throw new Error("unreachable");
    expect(result.current.state.result.title).toBe("Renamed after sharing");
  });

  it("reports a deleted or expired record as missing", async () => {
    const key = await generateKey();
    await setShareLocation(key);
    const repo = fakeRepo(async () => {
      throw new CloudNotFoundError();
    });

    const { result } = renderHook(() => useShareImport({ repo }));

    await waitFor(() => expect(result.current.state.kind).toBe("missing"));
  });

  it("surfaces any other failure as an error with its message", async () => {
    const key = await generateKey();
    await setShareLocation(key);
    const repo = fakeRepo(async () => {
      throw new Error("network unreachable");
    });

    const { result } = renderHook(() => useShareImport({ repo }));

    await waitFor(() => expect(result.current.state.kind).toBe("error"));
    if (result.current.state.kind !== "error") throw new Error("unreachable");
    expect(result.current.state.message).toBe("network unreachable");
  });

  it("reset() returns to idle but leaves the URL alone", async () => {
    const key = await generateKey();
    await setShareLocation(key);
    const doc = seededDoc();
    const repo = fakeRepo(async () => readResult(doc));

    const { result } = renderHook(() => useShareImport({ repo }));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    act(() => result.current.reset());

    expect(result.current.state.kind).toBe("idle");
    expect(window.location.pathname).toBe(`/grid/${RECORD_ID}`);
  });

  it("dismiss() returns to idle and strips the share link from the URL", async () => {
    const key = await generateKey();
    await setShareLocation(key);
    const doc = seededDoc();
    const repo = fakeRepo(async () => readResult(doc));

    const { result } = renderHook(() => useShareImport({ repo }));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));

    act(() => result.current.dismiss());

    expect(result.current.state.kind).toBe("idle");
    // Reloading must not re-trigger the import.
    expect(window.location.pathname).toBe("/");
    expect(window.location.hash).toBe("");
  });

  it("does not set state after unmount", async () => {
    const key = await generateKey();
    await setShareLocation(key);
    const doc = seededDoc();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const repo = fakeRepo(async () => {
      await gate;
      return readResult(doc);
    });

    const { unmount } = renderHook(() => useShareImport({ repo }));

    unmount();
    release?.();

    // A state update after unmount would surface as a React warning; the
    // hook's `cancelled` flag is what prevents it.
    await expect(gate).resolves.toBeUndefined();
  });
});
