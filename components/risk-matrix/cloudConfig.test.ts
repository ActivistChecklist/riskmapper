import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_CIPHERTEXT_BYTES,
  RETENTION_DAYS,
  cloudUrl,
  isCloudEnabled,
} from "./cloudConfig";

/**
 * Public cloud config. Both env reads happen at call time, and both are
 * `VITE_*` names, read from `import.meta.env` because this module runs in
 * the browser where `process` does not exist. These tests pin the semantics
 * independently of where the values come from.
 *
 * They cannot, however, catch a regression back to `process.env`: vitest
 * runs in Node, where that read succeeds. Only a real build does.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isCloudEnabled", () => {
  it("defaults to enabled when the var is unset", () => {
    vi.stubEnv("VITE_CLOUD_SYNC_ENABLED", undefined);
    expect(isCloudEnabled()).toBe(true);
  });

  it("is disabled only by the exact string \"false\"", () => {
    vi.stubEnv("VITE_CLOUD_SYNC_ENABLED", "false");
    expect(isCloudEnabled()).toBe(false);
  });

  it("stays enabled for any other value", () => {
    for (const value of ["true", "1", "0", "no", "FALSE", ""]) {
      vi.stubEnv("VITE_CLOUD_SYNC_ENABLED", value);
      expect(isCloudEnabled()).toBe(true);
    }
  });
});

describe("cloudUrl", () => {
  it("stays same-origin and relative with no override", () => {
    vi.stubEnv("VITE_CLOUD_API_URL", "");
    expect(cloudUrl("/api/matrix")).toBe("/api/matrix");
  });

  it("adds the leading slash when the caller omits it", () => {
    vi.stubEnv("VITE_CLOUD_API_URL", "");
    expect(cloudUrl("api/matrix")).toBe("/api/matrix");
  });

  it("treats an unset override the same as an empty one", () => {
    vi.stubEnv("VITE_CLOUD_API_URL", undefined);
    expect(cloudUrl("/api/matrix")).toBe("/api/matrix");
  });

  it("prefixes an absolute override", () => {
    vi.stubEnv("VITE_CLOUD_API_URL", "https://api.example.org");
    expect(cloudUrl("/api/matrix")).toBe("https://api.example.org/api/matrix");
  });

  it("strips a trailing slash from the override so URLs don't double up", () => {
    vi.stubEnv("VITE_CLOUD_API_URL", "https://api.example.org/");
    expect(cloudUrl("/api/matrix")).toBe("https://api.example.org/api/matrix");
  });

  it("preserves nested paths and query strings", () => {
    vi.stubEnv("VITE_CLOUD_API_URL", "");
    expect(cloudUrl("/api/matrix/abc/updates?since=4")).toBe(
      "/api/matrix/abc/updates?since=4",
    );
  });
});

describe("wire-format constants", () => {
  it("mirrors the server-side ciphertext cap", () => {
    // lib/cloud/config.ts defaults MAX_CIPHERTEXT_BYTES to the same value;
    // if one moves, the other has to move with it.
    expect(MAX_CIPHERTEXT_BYTES).toBe(256 * 1024);
  });

  it("mirrors the server-side retention window", () => {
    expect(RETENTION_DAYS).toBe(90);
  });
});
