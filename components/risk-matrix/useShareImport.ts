"use client";

import { useCallback, useEffect, useState } from "react";
import * as Y from "yjs";
import { base64urlEncode, keyToB64, SCHEMA_VERSION } from "@/lib/e2ee";
import {
  CloudNotFoundError,
  type CloudMatrixHandle,
  type MatrixCloudRepository,
} from "./matrixCloudRepository";
import { readMatrix } from "./matrixYDoc";
import {
  clearShareFromUrl,
  parseShareLocation,
  shareKeyFingerprint,
} from "./shareUrl";
import type { RiskMatrixSnapshot } from "./matrixTypes";

/**
 * Detects an inbound share link in the current URL, fetches the encrypted
 * baseline + updates, applies them to a fresh Y.Doc, and exposes the
 * derived snapshot + title plus the encoded Y.Doc state for adoption.
 *
 * SSR safety: this hook touches `window` only inside `useEffect`, and
 * returns `state.kind === "idle"` on the server.
 */

export type ShareImportResult = {
  title: string;
  snapshot: RiskMatrixSnapshot;
  /** Y.Doc state-as-update bytes — what gets persisted to localStorage on adopt. */
  yDocState: Uint8Array;
  headSeq: number;
};

export type ShareImportState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      handle: CloudMatrixHandle;
      result: ShareImportResult;
      keyB64: string;
      fingerprint: string;
    }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export type UseShareImportArgs = {
  repo: MatrixCloudRepository;
  /** Disables the hook entirely (e.g., when cloud is not configured). */
  enabled?: boolean;
};

export function useShareImport({ repo, enabled = true }: UseShareImportArgs) {
  const [state, setState] = useState<ShareImportState>({ kind: "idle" });

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    let cancelled = false;
    const parsed = parseShareLocation({
      pathname: window.location.pathname,
      hash: window.location.hash,
    });
    if (!parsed) return;
    const handle: CloudMatrixHandle = {
      recordId: parsed.recordId,
      key: parsed.key,
      schemaVersion: SCHEMA_VERSION,
    };
    void (async () => {
      setState({ kind: "loading" });
      try {
        const remote = await repo.read(handle);
        if (cancelled) return;
        const doc = new Y.Doc();
        if (remote.baseline) {
          Y.applyUpdate(doc, remote.baseline, "remote");
        }
        for (const u of remote.updates) {
          Y.applyUpdate(doc, u.bytes, "remote");
        }
        const view = readMatrix(doc);
        const yDocState = Y.encodeStateAsUpdate(doc);
        const result: ShareImportResult = {
          title: view.title,
          snapshot: {
            ...view.snapshot,
            collapsed: { red: false, orange: false, yellow: false, green: false },
            categorizedRevealHidden: { red: false, orange: false, yellow: false, green: false },
          },
          yDocState,
          headSeq: remote.headSeq,
        };
        setState({
          kind: "ready",
          handle,
          result,
          keyB64: keyToB64(parsed.key),
          fingerprint: shareKeyFingerprint(parsed.key),
        });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof CloudNotFoundError) {
          setState({ kind: "missing" });
        } else {
          const message =
            err instanceof Error ? err.message : "Failed to load shared matrix.";
          setState({ kind: "error", message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, repo]);

  /** Reset the hook's state without touching the URL. */
  const reset = useCallback(() => {
    setState({ kind: "idle" });
  }, []);

  /** Reset state AND strip the share-link path from the URL. */
  const dismiss = useCallback(() => {
    setState({ kind: "idle" });
    clearShareFromUrl();
  }, []);

  return { state, reset, dismiss };
}

/** Convenience: encode Y.Doc state for storage in `CloudMatrixMeta.yDocStateB64`. */
export function encodeYDocStateForMeta(state: Uint8Array): string {
  return base64urlEncode(state);
}
