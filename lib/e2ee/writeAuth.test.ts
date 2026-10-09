import { describe, expect, it } from "vitest";
import { base64urlEncode } from "./base64url";
import { generateKey } from "./envelope";
import { deriveWriteToken } from "./writeAuth";

describe("deriveWriteToken", () => {
  it("is deterministic, so every holder of the link derives the same token", async () => {
    const key = await generateKey();
    const a = await deriveWriteToken({ key, recordId: "rec-1" });
    const b = await deriveWriteToken({ key, recordId: "rec-1" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("differs per record and per key", async () => {
    const key = await generateKey();
    const other = await generateKey();
    const base = await deriveWriteToken({ key, recordId: "rec-1" });
    expect(await deriveWriteToken({ key, recordId: "rec-2" })).not.toBe(base);
    expect(await deriveWriteToken({ key: other, recordId: "rec-1" })).not.toBe(base);
  });

  it("is not the key itself", async () => {
    const key = await generateKey();
    const token = await deriveWriteToken({ key, recordId: "rec-1" });
    expect(token).not.toBe(base64urlEncode(key));
  });

  it("rejects a wrong-length key", async () => {
    await expect(
      deriveWriteToken({ key: new Uint8Array(31), recordId: "rec-1" }),
    ).rejects.toThrow();
  });
});
