import { beforeEach, describe, expect, it } from "vitest";
import {
  currentBuildId,
  DISMISS_FOR_DAYS,
  dismissUpdateNotice,
  shouldShowUpdateNotice,
  STALE_AFTER_DAYS,
} from "./offlineAge";

const DAY = 24 * 60 * 60 * 1000;
const BUILT = Date.UTC(2026, 10, 24);

beforeEach(() => {
  window.localStorage.clear();
});

const check = (build: string | null, now: number, builtAt = BUILT) =>
  shouldShowUpdateNotice({ storage: window.localStorage, build, builtAt, now });

describe("shouldShowUpdateNotice", () => {
  it("stays quiet for the first month after the build", () => {
    expect(check("v1", BUILT)).toBe(false);
    expect(check("v1", BUILT + STALE_AFTER_DAYS * DAY)).toBe(false);
  });

  it("shows once the build is more than a month old", () => {
    expect(check("v1", BUILT + (STALE_AFTER_DAYS + 1) * DAY)).toBe(true);
  });

  it("hides for a month after Dismiss, then comes back", () => {
    const stale = BUILT + 40 * DAY;
    dismissUpdateNotice({ storage: window.localStorage, build: "v1", now: stale });
    expect(check("v1", stale + DAY)).toBe(false);
    expect(check("v1", stale + (DISMISS_FOR_DAYS + 1) * DAY)).toBe(true);
  });

  it("keeps one copy's Dismiss from hiding another copy's notice", () => {
    // Chromium gives every local HTML file one storage area.
    const stale = BUILT + 40 * DAY;
    dismissUpdateNotice({ storage: window.localStorage, build: "v1", now: stale });
    expect(check("v2", stale + DAY)).toBe(true);
  });

  it("never shows without a build id, a valid date, or readable storage", () => {
    expect(check(null, BUILT + 400 * DAY)).toBe(false);
    expect(check("v1", BUILT + 400 * DAY, Number.NaN)).toBe(false);
    window.localStorage.setItem("rm-offline-update-dismissed", "{not json");
    // Unreadable dismissal counts as not dismissed.
    expect(check("v1", BUILT + 400 * DAY)).toBe(true);
  });
});

describe("currentBuildId", () => {
  it("reads the id the build writes into the page", () => {
    const meta = document.createElement("meta");
    meta.name = "riskmapper-offline-build";
    meta.content = "abc123";
    document.head.append(meta);
    expect(currentBuildId()).toBe("abc123");
    meta.remove();
    expect(currentBuildId()).toBe(null);
  });
});
