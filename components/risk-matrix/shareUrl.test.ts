import { describe, expect, it } from "vitest";
import { generateKey, keyToB64 } from "@/lib/e2ee";
import {
  SHARE_FRAGMENT_VERSION,
  buildShareUrl,
  parseShareLocation,
  shareKeyFingerprint,
} from "./shareUrl";

describe("shareUrl", () => {
  it("builds and parses a share URL round-trip", async () => {
    const key = await generateKey();
    const url = buildShareUrl({
      baseUrl: "https://app.example/riskmatrix/",
      recordId: "abc123",
      key,
    });
    const u = new URL(url);
    expect(u.searchParams.get("matrix")).toBe("abc123");
    expect(u.hash).toMatch(/^#k=[A-Za-z0-9_-]+&v=1$/);

    const parsed = parseShareLocation({ search: u.search, hash: u.hash });
    expect(parsed?.recordId).toBe("abc123");
    expect(parsed?.key).toEqual(key);
    expect(parsed?.fragmentVersion).toBe(SHARE_FRAGMENT_VERSION);
  });

  it("returns null when there's no matrix query", () => {
    expect(parseShareLocation({ search: "", hash: "#k=AAAA&v=1" })).toBeNull();
  });

  it("returns null when there's no fragment", () => {
    expect(parseShareLocation({ search: "?matrix=abc", hash: "" })).toBeNull();
  });

  it("returns null when key is missing", () => {
    expect(
      parseShareLocation({ search: "?matrix=abc", hash: "#v=1" }),
    ).toBeNull();
  });

  it("returns null on unsupported fragment version", () => {
    expect(
      parseShareLocation({
        search: "?matrix=abc",
        hash: "#k=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&v=99",
      }),
    ).toBeNull();
  });

  it("returns null on malformed key", () => {
    expect(
      parseShareLocation({ search: "?matrix=abc", hash: "#k=!!!&v=1" }),
    ).toBeNull();
    expect(
      parseShareLocation({ search: "?matrix=abc", hash: "#k=AAAA&v=1" }),
    ).toBeNull();
  });

  it("fingerprint returns last 6 chars of the key", async () => {
    const key = await generateKey();
    expect(shareKeyFingerprint(key)).toBe(keyToB64(key).slice(-6));
    expect(shareKeyFingerprint(key)).toHaveLength(6);
  });

  it("rejects empty recordId", async () => {
    const key = await generateKey();
    expect(() =>
      buildShareUrl({ baseUrl: "https://x/", recordId: "", key }),
    ).toThrow();
  });
});
