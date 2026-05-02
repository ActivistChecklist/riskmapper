import { describe, expect, it } from "vitest";
import { generateKey, keyToB64 } from "@/lib/e2ee";
import {
  buildShareUrl,
  parseShareLocation,
  shareKeyFingerprint,
} from "./shareUrl";

describe("shareUrl", () => {
  it("builds and parses a share URL round-trip", async () => {
    const key = await generateKey();
    const url = await buildShareUrl({
      origin: "https://app.example",
      recordId: "abc123def456ghij",
      key,
    });
    const u = new URL(url);
    expect(u.pathname).toBe("/grid/abc123def456ghij");
    expect(u.search).toBe("");
    // Browsers normalize "https://app.example" → "https://app.example/" so
    // the rebuilt origin matches but with a trailing slash on the input.
    expect(u.hash).toBe(`#${await keyToB64(key)}`);

    const parsed = await parseShareLocation({ pathname: u.pathname, hash: u.hash });
    expect(parsed?.recordId).toBe("abc123def456ghij");
    expect(parsed?.key).toEqual(key);
  });

  it("returns null when the path is not /grid/", async () => {
    expect(await parseShareLocation({ pathname: "/", hash: "#AAAA" })).toBeNull();
    expect(
      await parseShareLocation({ pathname: "/other/abc", hash: "#AAAA" }),
    ).toBeNull();
  });

  it("returns null when there's no fragment", async () => {
    expect(await parseShareLocation({ pathname: "/grid/abc123def456ghij", hash: "" })).toBeNull();
  });

  it("returns null on a malformed key", async () => {
    expect(
      await parseShareLocation({ pathname: "/grid/abc123def456ghij", hash: "#!!!" }),
    ).toBeNull();
    expect(
      await parseShareLocation({ pathname: "/grid/abc123def456ghij", hash: "#AAAA" }),
    ).toBeNull();
  });

  it("ignores a trailing slash in the path", async () => {
    const key = await generateKey();
    const parsed = await parseShareLocation({
      pathname: "/grid/abc123def456ghij/",
      hash: `#${await keyToB64(key)}`,
    });
    expect(parsed?.recordId).toBe("abc123def456ghij");
  });

  it("fingerprint returns last 6 chars of the key", async () => {
    const key = await generateKey();
    expect(await shareKeyFingerprint(key)).toBe((await keyToB64(key)).slice(-6));
    expect(await shareKeyFingerprint(key)).toHaveLength(6);
  });

  it("rejects empty recordId", async () => {
    const key = await generateKey();
    await expect(
      buildShareUrl({ origin: "https://x", recordId: "", key }),
    ).rejects.toThrow();
  });
});
