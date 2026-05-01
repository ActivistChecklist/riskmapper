import {
  SCHEMA_VERSION,
  base64urlEncode,
  decryptBytes,
  encryptBytes,
  generateKey,
} from "@/lib/e2ee";
import { MAX_CIPHERTEXT_BYTES, cloudUrl } from "./cloudConfig";

/**
 * Per-matrix, end-to-end encrypted cloud repository.
 *
 * The unit of cloud storage is one matrix, modeled as `(baseline,
 * append-only update log)`. Both the baseline and every update are opaque
 * encrypted bytes from the server's view. The HTTP fetch is dependency-
 * injected so tests can substitute a fake without touching `globalThis`.
 *
 * No conflict path: every append succeeds at a server-assigned monotonic
 * `seq`. Convergence is the caller's responsibility (Yjs merges).
 */

export type CloudMatrixHandle = {
  recordId: string;
  /** Raw 32-byte XChaCha20-Poly1305 key. Never serialized to logs or network. */
  key: Uint8Array;
  schemaVersion: typeof SCHEMA_VERSION;
};

export type RemoteUpdate = {
  seq: number;
  /** Decrypted Yjs binary update. */
  bytes: Uint8Array;
  clientId: string;
};

export type CloudReadResult = {
  /** Decrypted baseline bytes. Null when the caller passed `since` and the
   *  server elected to skip baseline (i.e. since >= baselineSeq). */
  baseline: Uint8Array | null;
  baselineSeq: number;
  headSeq: number;
  updates: RemoteUpdate[];
  lastWriteDate: string | null;
  lastReadDate: string | null;
  createdDate: string | null;
};

export class CloudNotFoundError extends Error {
  constructor() {
    super("This shared matrix is no longer available (404).");
    this.name = "CloudNotFoundError";
  }
}

export class CloudPayloadTooLargeError extends Error {
  constructor(size: number) {
    super(
      `Encrypted payload is too large to upload (${size} bytes; cap is ${MAX_CIPHERTEXT_BYTES}).`,
    );
    this.name = "CloudPayloadTooLargeError";
  }
}

export class CloudNetworkError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "CloudNetworkError";
    this.status = status;
  }
}

export type Fetcher = typeof fetch;

export type SubscribeHandlers = {
  onUpdate: (event: RemoteUpdate) => void;
  /** Called on transient errors; the EventSource auto-reconnects. */
  onError?: (err: Error) => void;
  onOpen?: () => void;
};

export type Subscription = {
  /** Unsubscribe and close the stream. Idempotent. */
  close(): void;
};

export type MatrixCloudRepository = {
  create(args: {
    baseline: Uint8Array;
  }): Promise<{ handle: CloudMatrixHandle; baselineSeq: number; headSeq: number }>;
  read(
    handle: CloudMatrixHandle,
    opts?: { sinceSeq?: number },
  ): Promise<CloudReadResult>;
  appendUpdate(args: {
    handle: CloudMatrixHandle;
    bytes: Uint8Array;
    clientId: string;
  }): Promise<{ seq: number }>;
  subscribe(
    args: { handle: CloudMatrixHandle; sinceSeq: number },
    handlers: SubscribeHandlers,
  ): Subscription;
  delete(handle: CloudMatrixHandle): Promise<void>;
};

type ServerCreateResponse = {
  id?: unknown;
  baselineSeq?: unknown;
  headSeq?: unknown;
  createdDate?: unknown;
  lastWriteDate?: unknown;
  lastReadDate?: unknown;
};

type ServerReadResponse = {
  baseline?: unknown;
  baselineSeq?: unknown;
  headSeq?: unknown;
  updates?: unknown;
  createdDate?: unknown;
  lastWriteDate?: unknown;
  lastReadDate?: unknown;
};

type ServerUpdateRow = {
  seq?: unknown;
  ciphertext?: unknown;
  clientId?: unknown;
};

type ServerAppendResponse = {
  seq?: unknown;
};

function asInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new CloudNetworkError(`Server response missing or invalid \`${field}\``);
  }
  return value;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CloudNetworkError(`Server response missing or invalid \`${field}\``);
  }
  return value;
}

function checkSize(envelope: string): void {
  if (envelope.length > MAX_CIPHERTEXT_BYTES) {
    throw new CloudPayloadTooLargeError(envelope.length);
  }
}

/** Mint a 96-bit record id encoded as 16 chars of base64url-no-pad. */
function mintRecordId(): string {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error(
      "crypto.getRandomValues is unavailable; cloud sync requires a secure context.",
    );
  }
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return base64urlEncode(bytes);
}

async function readBodyJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new CloudNetworkError(
      `Server returned a non-JSON response (HTTP ${res.status})`,
      res.status,
    );
  }
}

export type EventSourceLike = {
  addEventListener: (
    type: string,
    listener: (e: { data: string; lastEventId: string }) => void,
  ) => void;
  onopen: ((this: EventSource, ev: Event) => unknown) | null;
  onerror: ((this: EventSource, ev: Event) => unknown) | null;
  close(): void;
};

export type EventSourceFactory = (url: string) => EventSourceLike;

export function createMatrixCloudRepository(args?: {
  fetchFn?: Fetcher;
  /** Override the EventSource constructor; tests inject a fake. */
  eventSourceFactory?: EventSourceFactory;
}): MatrixCloudRepository {
  const fetchFn: Fetcher = args?.fetchFn ?? fetch.bind(globalThis);
  const eventSourceFactory: EventSourceFactory =
    args?.eventSourceFactory ??
    ((url: string) => {
      if (typeof EventSource === "undefined") {
        throw new Error("EventSource is unavailable in this environment.");
      }
      return new EventSource(url) as unknown as EventSourceLike;
    });

  async function postCreate(
    id: string,
    baseline: string,
  ): Promise<ServerCreateResponse> {
    const res = await fetchFn(cloudUrl("/api/matrix"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, baseline }),
    });
    if (res.status === 413) throw new CloudPayloadTooLargeError(baseline.length);
    if (!res.ok) {
      throw new CloudNetworkError(`Create failed (HTTP ${res.status})`, res.status);
    }
    return (await readBodyJson(res)) as ServerCreateResponse;
  }

  async function getRecord(
    recordId: string,
    sinceSeq: number | undefined,
  ): Promise<ServerReadResponse> {
    const qs = sinceSeq !== undefined ? `?since=${sinceSeq}` : "";
    const res = await fetchFn(
      cloudUrl(`/api/matrix/${encodeURIComponent(recordId)}${qs}`),
      { method: "GET" },
    );
    if (res.status === 404) throw new CloudNotFoundError();
    if (!res.ok) {
      throw new CloudNetworkError(`Read failed (HTTP ${res.status})`, res.status);
    }
    return (await readBodyJson(res)) as ServerReadResponse;
  }

  async function postAppend(
    recordId: string,
    body: { ciphertext: string; clientId: string },
  ): Promise<ServerAppendResponse> {
    const res = await fetchFn(
      cloudUrl(`/api/matrix/${encodeURIComponent(recordId)}/updates`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (res.status === 404) throw new CloudNotFoundError();
    if (res.status === 413) throw new CloudPayloadTooLargeError(body.ciphertext.length);
    if (!res.ok) {
      throw new CloudNetworkError(`Append failed (HTTP ${res.status})`, res.status);
    }
    return (await readBodyJson(res)) as ServerAppendResponse;
  }

  async function deleteRecord(recordId: string): Promise<void> {
    const res = await fetchFn(
      cloudUrl(`/api/matrix/${encodeURIComponent(recordId)}`),
      { method: "DELETE" },
    );
    if (res.status === 404 || res.status === 204 || res.ok) return;
    throw new CloudNetworkError(`Delete failed (HTTP ${res.status})`, res.status);
  }

  return {
    async create({ baseline }) {
      const key = await generateKey();
      const recordId = mintRecordId();
      const { envelope } = await encryptBytes({
        bytes: baseline,
        key,
        aad: { recordId, schemaVersion: SCHEMA_VERSION },
      });
      checkSize(envelope);
      const created = await postCreate(recordId, envelope);
      const returnedId = asNonEmptyString(created.id, "id");
      if (returnedId !== recordId) {
        throw new CloudNetworkError(
          "Server returned a different record id than the client minted",
        );
      }
      return {
        handle: { recordId, key, schemaVersion: SCHEMA_VERSION },
        baselineSeq: asInt(created.baselineSeq, "baselineSeq"),
        headSeq: asInt(created.headSeq, "headSeq"),
      };
    },

    async read(handle, opts) {
      const data = await getRecord(handle.recordId, opts?.sinceSeq);
      const baselineSeq = asInt(data.baselineSeq, "baselineSeq");
      const headSeq = asInt(data.headSeq, "headSeq");
      let baselineBytes: Uint8Array | null = null;
      if (data.baseline !== null) {
        const baselineEnv = asNonEmptyString(data.baseline, "baseline");
        baselineBytes = await decryptBytes({
          envelope: baselineEnv,
          key: handle.key,
          aad: { recordId: handle.recordId, schemaVersion: SCHEMA_VERSION },
        });
      }
      const updatesRaw = Array.isArray(data.updates) ? (data.updates as ServerUpdateRow[]) : [];
      const updates: RemoteUpdate[] = [];
      for (const u of updatesRaw) {
        const seq = asInt(u.seq, "updates[].seq");
        const ct = asNonEmptyString(u.ciphertext, "updates[].ciphertext");
        const clientId = asNonEmptyString(u.clientId, "updates[].clientId");
        const bytes = await decryptBytes({
          envelope: ct,
          key: handle.key,
          aad: { recordId: handle.recordId, schemaVersion: SCHEMA_VERSION },
        });
        updates.push({ seq, bytes, clientId });
      }
      return {
        baseline: baselineBytes,
        baselineSeq,
        headSeq,
        updates,
        lastWriteDate: asString(data.lastWriteDate),
        lastReadDate: asString(data.lastReadDate),
        createdDate: asString(data.createdDate),
      };
    },

    async appendUpdate({ handle, bytes, clientId }) {
      const { envelope } = await encryptBytes({
        bytes,
        key: handle.key,
        aad: { recordId: handle.recordId, schemaVersion: SCHEMA_VERSION },
      });
      checkSize(envelope);
      const data = await postAppend(handle.recordId, {
        ciphertext: envelope,
        clientId,
      });
      return { seq: asInt(data.seq, "seq") };
    },

    subscribe({ handle, sinceSeq }, handlers) {
      const url = cloudUrl(`/api/matrix/${encodeURIComponent(handle.recordId)}/events`);
      const es = eventSourceFactory(url);
      let closed = false;
      const onMessage = (e: { data: string; lastEventId: string }) => {
        if (closed) return;
        try {
          const parsed = JSON.parse(e.data) as ServerUpdateRow;
          const seq = asInt(parsed.seq, "seq");
          if (seq <= sinceSeq) return; // already saw via initial read
          const ct = asNonEmptyString(parsed.ciphertext, "ciphertext");
          const clientId = asNonEmptyString(parsed.clientId, "clientId");
          void decryptBytes({
            envelope: ct,
            key: handle.key,
            aad: { recordId: handle.recordId, schemaVersion: SCHEMA_VERSION },
          })
            .then((bytes) => {
              if (closed) return;
              handlers.onUpdate({ seq, bytes, clientId });
            })
            .catch((err) => {
              handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
            });
        } catch (err) {
          handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      };
      es.addEventListener("update", onMessage);
      es.onopen = () => handlers.onOpen?.();
      es.onerror = () => {
        if (closed) return;
        handlers.onError?.(new CloudNetworkError("SSE stream errored"));
      };
      return {
        close() {
          if (closed) return;
          closed = true;
          es.close();
        },
      };
    },

    async delete(handle) {
      await deleteRecord(handle.recordId);
    },
  };
}
