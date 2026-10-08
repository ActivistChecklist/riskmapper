import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  INITIAL_CATEGORIZED_REVEAL_HIDDEN,
  INITIAL_COLLAPSED,
} from "./constants";
import { editRiskText, readMatrix, seedYDoc, setTitle } from "./matrixYDoc";
import type { MatrixWorkspaceV1, RiskMatrixSnapshot } from "./matrixTypes";
import { emptyGrid } from "./riskMatrixUtils";
import type { UseCloudMatrixCallbacks } from "./useCloudMatrix";

/**
 * Regression coverage for "when two people edit at the same time, the
 * person not typing loses focus on every update".
 *
 * Root cause: every remote change bumped a counter that was part of the
 * canvas's React `key`, so the whole matrix remounted and the textarea
 * the local user was typing in was destroyed and recreated without focus.
 *
 * useCloudMatrix is replaced with a stub that hands out a real Y.Doc and
 * captures the sync callbacks, so the test can play the part of the SSE
 * handler: apply a peer's update with origin "remote", then fire
 * `onChange` the way useCloudMatrix does.
 */

const cloudStub = vi.hoisted(() => ({
  doc: null as import("yjs").Doc | null,
  callbacks: {} as import("./useCloudMatrix").UseCloudMatrixCallbacks,
}));

vi.mock("./useCloudMatrix", () => ({
  useCloudMatrix: (
    activeMeta: unknown,
    callbacks: UseCloudMatrixCallbacks = {},
  ) => {
    cloudStub.callbacks = callbacks;
    return {
      syncState: { kind: "idle" },
      repo: {},
      doc: activeMeta ? cloudStub.doc : null,
      flush: async () => {},
      cancel: () => {},
      acknowledge: () => {},
      reopenAction: () => {},
    };
  },
}));

// Imported after the mock is registered.
const { default: RiskMatrix } = await import("./RiskMatrix");

const STORAGE_KEY = "riskmatrix.workspace.v1";
const REMOTE_ORIGIN = "remote";

function snapshot(): RiskMatrixSnapshot {
  return {
    pool: [
      { id: "rm-ln-i-1", text: "alpha" },
      { id: "rm-ln-i-2", text: "beta" },
    ],
    grid: emptyGrid(),
    collapsed: { ...INITIAL_COLLAPSED },
    otherActions: [],
    hiddenCategorizedRiskKeys: [],
    categorizedRevealHidden: { ...INITIAL_CATEGORIZED_REVEAL_HIDDEN },
    notes: "",
  };
}

function seedWorkspace(): void {
  const ws: MatrixWorkspaceV1 = {
    v: 1,
    activeKind: "saved",
    activeSavedId: "row-1",
    defaultSnapshot: null,
    draftTitle: "Draft",
    saved: [
      {
        id: "row-1",
        title: "Shared",
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
}

/** A second device: forks the doc, edits, and returns the update bytes. */
function peerEdit(edit: (peer: Y.Doc) => void): Uint8Array {
  const local = cloudStub.doc!;
  const peer = new Y.Doc();
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(local));
  const before = Y.encodeStateVector(peer);
  edit(peer);
  return Y.encodeStateAsUpdate(peer, before);
}

let seq = 0;

/**
 * Mirror useCloudMatrix's SSE onUpdate for a non-self event that
 * advances the head: apply, persist meta + snapshot, then notify.
 */
function deliverRemote(update: Uint8Array): void {
  const doc = cloudStub.doc!;
  act(() => {
    Y.applyUpdate(doc, update, REMOTE_ORIGIN);
    seq += 1;
    cloudStub.callbacks.onMetaUpdate?.(
      "rec-1",
      {
        recordId: "rec-1",
        keyB64: "k".repeat(43),
        lastHeadSeq: seq,
        yDocStateB64: "",
      },
      doc,
    );
    cloudStub.callbacks.onChange?.(doc);
  });
}

function poolTextarea(container: HTMLElement, id: string): HTMLTextAreaElement {
  const el = container.querySelector<HTMLTextAreaElement>(
    `textarea[data-line-id="${id}"]`,
  );
  if (!el) throw new Error(`no textarea for ${id}`);
  return el;
}

describe("RiskMatrix live sync", () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedWorkspace();
    const doc = new Y.Doc();
    seedYDoc(doc, { title: "Shared", snapshot: snapshot() });
    cloudStub.doc = doc;
  });

  afterEach(() => {
    window.localStorage.clear();
    cloudStub.doc = null;
  });

  it("keeps focus in the box being typed in when another device edits a different box", () => {
    const { container } = render(<RiskMatrix />);
    const mine = poolTextarea(container, "rm-ln-i-1");
    mine.focus();
    fireEvent.change(mine, { target: { value: "alpha typed" } });
    expect(document.activeElement).toBe(mine);

    deliverRemote(
      peerEdit((peer) => editRiskText(peer, "rm-ln-i-2", "beta from peer")),
    );

    // Same DOM node, still focused, still holding what this user typed.
    expect(mine.isConnected).toBe(true);
    expect(document.activeElement).toBe(mine);
    expect(mine.value).toBe("alpha typed");
    // And the other device's edit is on screen.
    expect(poolTextarea(container, "rm-ln-i-2").value).toBe("beta from peer");
  });

  it("does not write anything back to the doc when applying a remote edit", () => {
    render(<RiskMatrix />);
    const doc = cloudStub.doc!;
    const update = peerEdit((peer) =>
      editRiskText(peer, "rm-ln-i-2", "beta from peer"),
    );

    const localOps: Uint8Array[] = [];
    doc.on("update", (u: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE_ORIGIN) localOps.push(u);
    });
    deliverRemote(update);

    expect(localOps).toEqual([]);
    expect(readMatrix(doc).snapshot.pool.map((p) => p.text)).toEqual([
      "alpha",
      "beta from peer",
    ]);
  });

  it("does not revert remote risk edits that arrive together with a title change", () => {
    render(<RiskMatrix />);
    const doc = cloudStub.doc!;
    deliverRemote(
      peerEdit((peer) => {
        peer.transact(() => {
          setTitle(peer, "Renamed by peer");
          editRiskText(peer, "rm-ln-i-2", "beta from peer");
        });
      }),
    );
    const { title, snapshot: snap } = readMatrix(doc);
    expect(title).toBe("Renamed by peer");
    expect(snap.pool.find((p) => p.id === "rm-ln-i-2")?.text).toBe(
      "beta from peer",
    );
  });
});
