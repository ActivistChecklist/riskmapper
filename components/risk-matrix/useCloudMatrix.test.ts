import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { __test, type Live } from "./useCloudMatrix";
import {
  type CompactResult,
  type MatrixCloudRepository,
} from "./matrixCloudRepository";
import { SCHEMA_VERSION } from "@/lib/e2ee";

/**
 * Focused unit tests for `maybeCompact` — the threshold + race-loss logic
 * that decides whether to PUT a fresh snapshot to the server. We don't
 * exercise the full hook (renderHook + EventSource + Y.Doc on update +
 * outbox debounce) here; that's covered by integration testing in the
 * browser. These tests pin the small piece of logic that matters: when
 * does compaction fire, when does it back off, and how do we react to a
 * race-lost response.
 */

const { maybeCompact, COMPACTION_THRESHOLD_UPDATES } = __test;

function makeLive(overrides: Partial<Live> = {}): Live {
  const doc = new Y.Doc();
  return {
    handle: {
      recordId: "rec-1",
      key: new Uint8Array(32),
      schemaVersion: SCHEMA_VERSION,
    },
    doc,
    clientId: String(doc.clientID),
    lastHeadSeq: 0,
    lastBaselineSeq: 0,
    compactionInFlight: false,
    pending: null,
    inFlight: false,
    backoffMs: 1000,
    backoffTimer: null,
    drainTimer: null,
    transientDisplayTimer: null,
    subscription: null,
    cancelled: false,
    waiters: [],
    ready: true,
    ...overrides,
  };
}

type CompactFn = MatrixCloudRepository["compact"];

function makeRepo(compactImpl: CompactFn): MatrixCloudRepository {
  return {
    create: vi.fn(),
    read: vi.fn(),
    appendUpdate: vi.fn(),
    compact: vi.fn(compactImpl),
    subscribe: vi.fn(),
    delete: vi.fn(),
  } as unknown as MatrixCloudRepository;
}

describe("maybeCompact", () => {
  it("does nothing when below threshold", async () => {
    const live = makeLive({
      lastHeadSeq: COMPACTION_THRESHOLD_UPDATES - 1,
      lastBaselineSeq: 0,
    });
    const compact = vi.fn<CompactFn>();
    const repo = makeRepo(compact);
    await maybeCompact(live, repo, { current: {} });
    expect(compact).not.toHaveBeenCalled();
    expect(live.compactionInFlight).toBe(false);
  });

  it("calls repo.compact when the unfolded log meets the threshold", async () => {
    const live = makeLive({
      lastHeadSeq: COMPACTION_THRESHOLD_UPDATES,
      lastBaselineSeq: 0,
    });
    const compact = vi.fn<CompactFn>(
      async (): Promise<CompactResult> => ({
        kind: "applied",
        baselineSeq: COMPACTION_THRESHOLD_UPDATES,
        headSeq: COMPACTION_THRESHOLD_UPDATES,
      }),
    );
    const repo = makeRepo(compact);
    await maybeCompact(live, repo, { current: {} });
    expect(compact).toHaveBeenCalledTimes(1);
    const callArg = compact.mock.calls[0]?.[0];
    if (!callArg) throw new Error("compact was not called with arguments");
    expect(callArg.baselineSeq).toBe(COMPACTION_THRESHOLD_UPDATES);
    expect(callArg.handle.recordId).toBe("rec-1");
    expect(callArg.bytes).toBeInstanceOf(Uint8Array);
    // Doc state advanced.
    expect(live.lastBaselineSeq).toBe(COMPACTION_THRESHOLD_UPDATES);
    expect(live.compactionInFlight).toBe(false);
  });

  it("adopts server-reported baselineSeq on race-loss without throwing", async () => {
    const live = makeLive({
      lastHeadSeq: COMPACTION_THRESHOLD_UPDATES,
      lastBaselineSeq: 0,
    });
    const compact = vi.fn<CompactFn>(
      async (): Promise<CompactResult> => ({
        kind: "raceLost",
        baselineSeq: 95, // another tab beat us to it
        headSeq: 110,
      }),
    );
    const repo = makeRepo(compact);
    await expect(
      maybeCompact(live, repo, { current: {} }),
    ).resolves.toBeUndefined();
    expect(live.lastBaselineSeq).toBe(95);
    expect(live.lastHeadSeq).toBe(110);
    expect(live.compactionInFlight).toBe(false);
  });

  it("skips when a compaction is already in flight", async () => {
    const live = makeLive({
      lastHeadSeq: COMPACTION_THRESHOLD_UPDATES + 50,
      lastBaselineSeq: 0,
      compactionInFlight: true,
    });
    const compact = vi.fn<CompactFn>();
    const repo = makeRepo(compact);
    await maybeCompact(live, repo, { current: {} });
    expect(compact).not.toHaveBeenCalled();
  });

  it("skips when the outbox has unsent edits (avoids snapshotting unobserved state)", async () => {
    const live = makeLive({
      lastHeadSeq: COMPACTION_THRESHOLD_UPDATES,
      lastBaselineSeq: 0,
      pending: new Uint8Array([1, 2, 3]),
    });
    const compact = vi.fn<CompactFn>();
    const repo = makeRepo(compact);
    await maybeCompact(live, repo, { current: {} });
    expect(compact).not.toHaveBeenCalled();
  });

  it("skips when an append is in-flight", async () => {
    const live = makeLive({
      lastHeadSeq: COMPACTION_THRESHOLD_UPDATES,
      lastBaselineSeq: 0,
      inFlight: true,
    });
    const compact = vi.fn<CompactFn>();
    const repo = makeRepo(compact);
    await maybeCompact(live, repo, { current: {} });
    expect(compact).not.toHaveBeenCalled();
  });

  it("skips when the live record has been cancelled (e.g. matrix swap)", async () => {
    const live = makeLive({
      lastHeadSeq: COMPACTION_THRESHOLD_UPDATES,
      lastBaselineSeq: 0,
      cancelled: true,
    });
    const compact = vi.fn<CompactFn>();
    const repo = makeRepo(compact);
    await maybeCompact(live, repo, { current: {} });
    expect(compact).not.toHaveBeenCalled();
  });

  it("skips when the key has not yet resolved (ready=false)", async () => {
    const live = makeLive({
      lastHeadSeq: COMPACTION_THRESHOLD_UPDATES,
      lastBaselineSeq: 0,
      ready: false,
    });
    const compact = vi.fn<CompactFn>();
    const repo = makeRepo(compact);
    await maybeCompact(live, repo, { current: {} });
    expect(compact).not.toHaveBeenCalled();
  });

  it("swallows errors from repo.compact (compaction is opportunistic)", async () => {
    const live = makeLive({
      lastHeadSeq: COMPACTION_THRESHOLD_UPDATES,
      lastBaselineSeq: 0,
    });
    const compact = vi.fn<CompactFn>(async () => {
      throw new Error("boom");
    });
    const repo = makeRepo(compact);
    await expect(
      maybeCompact(live, repo, { current: {} }),
    ).resolves.toBeUndefined();
    expect(compact).toHaveBeenCalledTimes(1);
    expect(live.compactionInFlight).toBe(false);
    // No state advance because the call failed.
    expect(live.lastBaselineSeq).toBe(0);
  });

  it("calls onMetaUpdate after a successful compaction so callers can persist", async () => {
    const live = makeLive({
      lastHeadSeq: COMPACTION_THRESHOLD_UPDATES,
      lastBaselineSeq: 0,
    });
    const compact = vi.fn<CompactFn>(
      async (): Promise<CompactResult> => ({
        kind: "applied",
        baselineSeq: COMPACTION_THRESHOLD_UPDATES,
        headSeq: COMPACTION_THRESHOLD_UPDATES,
      }),
    );
    const repo = makeRepo(compact);
    const onMetaUpdate = vi.fn();
    await maybeCompact(live, repo, { current: { onMetaUpdate } });
    expect(onMetaUpdate).toHaveBeenCalledTimes(1);
    const call = onMetaUpdate.mock.calls[0];
    if (!call) throw new Error("onMetaUpdate was not called");
    const meta = call[1];
    expect(meta.lastHeadSeq).toBe(COMPACTION_THRESHOLD_UPDATES);
  });
});
