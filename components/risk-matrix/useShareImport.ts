"use client";

import { useCallback, useEffect, useState } from "react";
import { keyToB64, SCHEMA_VERSION } from "@/lib/e2ee";
import {
  CloudNotFoundError,
  CloudRollbackError,
  type CloudMatrixHandle,
  type CloudReadResult,
  type MatrixCloudRepository,
} from "./matrixCloudRepository";
import {
  clearShareFromUrl,
  parseShareLocation,
  shareKeyFingerprint,
} from "./shareUrl";

/**
 * Detects an inbound share link in the current URL and resolves it into a
 * decrypted, **sandboxed** view of a remote matrix.
 *
 * The sandbox is the key UX guarantee: opening a share link does NOT mutate
 * the user's local library. They see "Viewing shared matrix" and must
 * explicitly click "Save on this device" to add it. This avoids the surprise
 * of someone else's link polluting your saved matrices.
 *
 * SSR safety: this hook touches `window` only inside `useEffect`, and
 * returns `state.kind === "idle"` on the server.
 */

export type ShareImportState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      handle: CloudMatrixHandle;
      result: CloudReadResult;
      keyB64: string;
      fingerprint: string;
    }
  | { kind: "missing" }
  | { kind: "rollback"; message: string }
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
      search: window.location.search,
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
        const result = await repo.read(handle);
        if (cancelled) return;
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
        } else if (err instanceof CloudRollbackError) {
          setState({ kind: "rollback", message: err.message });
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

  const dismiss = useCallback(() => {
    setState({ kind: "idle" });
    clearShareFromUrl();
  }, []);

  return { state, dismiss };
}
