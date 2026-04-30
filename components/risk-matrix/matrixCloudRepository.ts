import {
  SCHEMA_VERSION,
  base64urlEncode,
  decryptPayload,
  encryptPayload,
  generateKey,
} from "@/lib/e2ee";
import { MAX_CIPHERTEXT_BYTES, cloudUrl } from "./cloudConfig";
import { forgetRecord, recordObservedVersion } from "./cloudRollbackStore";
import type { RiskMatrixSnapshot } from "./matrixTypes";

/**
 * Per-matrix, end-to-end encrypted cloud repository.
 *
 * The unit of cloud storage is one matrix (one snapshot + title), not the
 * whole workspace. The server is honest-but-curious: ciphertext is opaque
 * and metadata reveals nothing about the title or contents.
 *
 * The HTTP fetch is dependency-injected so tests can substitute a fake
 * without touching `globalThis`.
 */

export type CloudMatrixHandle = {
  recordId: string;
  /** Raw 32-byte XChaCha20-Poly1305 key. Never serialized to logs or network. */
  key: Uint8Array;
  schemaVersion: typeof SCHEMA_VERSION;
};

export type CloudReadResult = {
  snapshot: RiskMatrixSnapshot;
  title: string;
  version: number;
  lamport: number;
  lastWriteDate: string | null;
  lastReadDate: string | null;
  createdDate: string | null;
};

export type CloudWriteResult = {
  version: number;
  lastWriteDate: string | null;
};

export type CloudConflict = {
  remoteCiphertext: string;
  remoteVersion: number;
  remoteLamport: number;
};

export class CloudConflictError extends Error {
  readonly conflict: CloudConflict;
  constructor(conflict: CloudConflict) {
    super("Cloud write conflict (server has a newer version).");
    this.name = "CloudConflictError";
    this.conflict = conflict;
  }
}

export class CloudRollbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudRollbackError";
  }
}

export class CloudNotFoundError extends Error {
  constructor() {
    super("This shared matrix is no longer available (404).");
    this.name = "CloudNotFoundError";
  }
}

export class CloudPayloadTooLargeError extends Error {
  constructor(size: number) {
    super(
      `Encrypted matrix is too large to upload (${size} bytes; cap is ${MAX_CIPHERTEXT_BYTES}).`,
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

export type MatrixCloudRepository = {
  create(args: {
    snapshot: RiskMatrixSnapshot;
    title: string;
  }): Promise<{ handle: CloudMatrixHandle; version: number }>;
  read(handle: CloudMatrixHandle): Promise<CloudReadResult>;
  write(args: {
    handle: CloudMatrixHandle;
    snapshot: RiskMatrixSnapshot;
    title: string;
    expectedVersion: number;
    lamport: number;
  }): Promise<CloudWriteResult>;
  delete(handle: CloudMatrixHandle): Promise<void>;
};

type ServerCreateResponse = {
  id?: unknown;
  version?: unknown;
  createdDate?: unknown;
  lastWriteDate?: unknown;
  lastReadDate?: unknown;
};

type ServerReadResponse = {
  ciphertext?: unknown;
  version?: unknown;
  lamport?: unknown;
  createdDate?: unknown;
  lastWriteDate?: unknown;
  lastReadDate?: unknown;
};

type ServerWriteResponse = {
  version?: unknown;
  lastWriteDate?: unknown;
};

type ServerConflictResponse = {
  ciphertext?: unknown;
  version?: unknown;
  lamport?: unknown;
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

/**
 * Mint a 96-bit record id encoded as 16 chars of base64url-no-pad. Matches
 * the server's `^[A-Za-z0-9_-]{16,64}$` validator. 96 bits is well above
 * any realistic collision risk for our scale; the trade-off vs a UUID is a
 * shorter share URL.
 */
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

export function createMatrixCloudRepository(args?: {
  fetchFn?: Fetcher;
}): MatrixCloudRepository {
  const fetchFn: Fetcher = args?.fetchFn ?? fetch.bind(globalThis);

  async function postCreate(
    id: string,
    envelope: string,
  ): Promise<ServerCreateResponse> {
    const res = await fetchFn(cloudUrl("/api/matrix"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ciphertext: envelope }),
    });
    if (res.status === 413) throw new CloudPayloadTooLargeError(envelope.length);
    if (!res.ok) {
      throw new CloudNetworkError(`Create failed (HTTP ${res.status})`, res.status);
    }
    return (await readBodyJson(res)) as ServerCreateResponse;
  }

  async function getRecord(recordId: string): Promise<ServerReadResponse> {
    const res = await fetchFn(cloudUrl(`/api/matrix/${encodeURIComponent(recordId)}`), {
      method: "GET",
    });
    if (res.status === 404) throw new CloudNotFoundError();
    if (!res.ok) {
      throw new CloudNetworkError(`Read failed (HTTP ${res.status})`, res.status);
    }
    return (await readBodyJson(res)) as ServerReadResponse;
  }

  async function putRecord(
    recordId: string,
    body: { ciphertext: string; lamport: number; expectedVersion: number },
  ): Promise<ServerWriteResponse> {
    const res = await fetchFn(cloudUrl(`/api/matrix/${encodeURIComponent(recordId)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 404) throw new CloudNotFoundError();
    if (res.status === 413) throw new CloudPayloadTooLargeError(body.ciphertext.length);
    if (res.status === 409) {
      const data = (await readBodyJson(res)) as ServerConflictResponse;
      throw new CloudConflictError({
        remoteCiphertext: asNonEmptyString(data.ciphertext, "ciphertext"),
        remoteVersion: asInt(data.version, "version"),
        remoteLamport: asInt(data.lamport, "lamport"),
      });
    }
    if (!res.ok) {
      throw new CloudNetworkError(`Write failed (HTTP ${res.status})`, res.status);
    }
    return (await readBodyJson(res)) as ServerWriteResponse;
  }

  async function deleteRecord(recordId: string): Promise<void> {
    const res = await fetchFn(cloudUrl(`/api/matrix/${encodeURIComponent(recordId)}`), {
      method: "DELETE",
    });
    if (res.status === 404 || res.status === 204 || res.ok) return;
    throw new CloudNetworkError(`Delete failed (HTTP ${res.status})`, res.status);
  }

  return {
    async create({ snapshot, title }) {
      const key = await generateKey();
      // Single-request create: the client mints a 128-bit recordId locally so
      // the ciphertext can be encrypted with AAD bound to the canonical id on
      // the first try. Server validates the id shape and rejects collisions
      // with 409 (astronomically unlikely with randomUUID). One round trip;
      // one encrypt; no orphan-record possibility.
      const recordId = mintRecordId();
      const encrypted = await encryptPayload({
        payload: { schemaVersion: SCHEMA_VERSION, title, snapshot, lamport: 1 },
        key,
        aad: {
          recordId,
          schemaVersion: SCHEMA_VERSION,
          version: 1,
          lamport: 1,
        },
      });
      checkSize(encrypted.envelope);
      const created = await postCreate(recordId, encrypted.envelope);
      const returnedId = asNonEmptyString(created.id, "id");
      const version = asInt(created.version, "version");
      if (returnedId !== recordId) {
        // Defense-in-depth: the server must echo back the id we sent. A
        // mismatch means a buggy or malicious server attempting to bind our
        // key to a different record. Refuse.
        throw new CloudNetworkError(
          "Server returned a different record id than the client minted",
        );
      }
      const probe = recordObservedVersion(recordId, version);
      if (probe === "rollback") {
        throw new CloudRollbackError(
          "Server returned a stale version after create (rollback detected).",
        );
      }
      return {
        handle: { recordId, key, schemaVersion: SCHEMA_VERSION },
        version,
      };
    },

    async read(handle) {
      const data = await getRecord(handle.recordId);
      const version = asInt(data.version, "version");
      const lamport = asInt(data.lamport, "lamport");
      const ciphertext = asNonEmptyString(data.ciphertext, "ciphertext");
      const probe = recordObservedVersion(handle.recordId, version);
      if (probe === "rollback") {
        throw new CloudRollbackError(
          "Server returned an older version than we previously observed (rollback).",
        );
      }
      const payload = await decryptPayload<RiskMatrixSnapshot>({
        envelope: ciphertext,
        key: handle.key,
        aad: {
          recordId: handle.recordId,
          schemaVersion: SCHEMA_VERSION,
          version,
          lamport,
        },
      });
      return {
        snapshot: payload.snapshot,
        title: payload.title,
        version,
        lamport,
        lastWriteDate: asString(data.lastWriteDate),
        lastReadDate: asString(data.lastReadDate),
        createdDate: asString(data.createdDate),
      };
    },

    async write({ handle, snapshot, title, expectedVersion, lamport }) {
      const nextServerVersion = expectedVersion + 1;
      const { envelope } = await encryptPayload({
        payload: { schemaVersion: SCHEMA_VERSION, title, snapshot, lamport },
        key: handle.key,
        aad: {
          recordId: handle.recordId,
          schemaVersion: SCHEMA_VERSION,
          version: nextServerVersion,
          lamport,
        },
      });
      checkSize(envelope);
      const data = await putRecord(handle.recordId, {
        ciphertext: envelope,
        lamport,
        expectedVersion,
      });
      const version = asInt(data.version, "version");
      const probe = recordObservedVersion(handle.recordId, version);
      if (probe === "rollback") {
        throw new CloudRollbackError(
          "Server returned a stale version after write (rollback detected).",
        );
      }
      return { version, lastWriteDate: asString(data.lastWriteDate) };
    },

    async delete(handle) {
      await deleteRecord(handle.recordId);
      forgetRecord(handle.recordId);
    },
  };
}
