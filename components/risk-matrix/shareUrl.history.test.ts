import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateKey, keyToB64 } from "@/lib/e2ee";
import {
  SHARE_PATH_PREFIX,
  clearShareFromUrl,
  setShareUrlInAddressBar,
} from "./shareUrl";

/**
 * The two `history.replaceState` call sites. `shareUrl.test.ts` covers the
 * pure build/parse functions; these are the ones coupled to the router,
 * so they need pinning before the app moves off the Next.js App Router.
 */

const RECORD_ID = "abc123def456ghij";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("clearShareFromUrl", () => {
  it("drops both the share path and the key fragment", async () => {
    const keyB64 = await keyToB64(await generateKey());
    window.history.replaceState(null, "", `/grid/${RECORD_ID}#${keyB64}`);
    expect(window.location.pathname).toBe(`/grid/${RECORD_ID}`);

    clearShareFromUrl();

    expect(window.location.pathname).toBe("/");
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("");
  });

  it("replaces rather than pushes, so Back doesn't re-trigger the import", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");

    window.history.replaceState(null, "", `/grid/${RECORD_ID}#AAAA`);
    replace.mockClear();

    clearShareFromUrl();

    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    replace.mockRestore();
    push.mockRestore();
  });
});

describe("setShareUrlInAddressBar", () => {
  it("writes the canonical share URL for the record and key", async () => {
    const key = await generateKey();
    await setShareUrlInAddressBar({ recordId: RECORD_ID, key });

    expect(window.location.pathname).toBe(`${SHARE_PATH_PREFIX}${RECORD_ID}`);
    expect(window.location.hash).toBe(`#${await keyToB64(key)}`);
    expect(window.location.origin).toBe(window.origin);
  });

  it("is idempotent — an already-correct URL is not rewritten", async () => {
    const key = await generateKey();
    await setShareUrlInAddressBar({ recordId: RECORD_ID, key });

    const replace = vi.spyOn(window.history, "replaceState");
    await setShareUrlInAddressBar({ recordId: RECORD_ID, key });
    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });

  it("overwrites a stale share URL when the record changes", async () => {
    const key = await generateKey();
    await setShareUrlInAddressBar({ recordId: RECORD_ID, key });
    await setShareUrlInAddressBar({ recordId: "zzz999yyy888xxx7", key });

    expect(window.location.pathname).toBe(`${SHARE_PATH_PREFIX}zzz999yyy888xxx7`);
  });

  it("discards a pre-existing query string", async () => {
    window.history.replaceState(null, "", "/?utm_source=newsletter");
    const key = await generateKey();
    await setShareUrlInAddressBar({ recordId: RECORD_ID, key });

    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe(`${SHARE_PATH_PREFIX}${RECORD_ID}`);
  });
});
