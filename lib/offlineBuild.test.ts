import { afterEach, describe, expect, it, vi } from "vitest";
import { isOfflineBuild, siteIconSrc, sitePageLinkProps } from "./offlineBuild";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isOfflineBuild", () => {
  it("is off unless the offline build sets it", () => {
    expect(isOfflineBuild()).toBe(false);
    vi.stubEnv("VITE_OFFLINE_BUILD", "false");
    expect(isOfflineBuild()).toBe(false);
  });

  it("is on in the offline build", () => {
    vi.stubEnv("VITE_OFFLINE_BUILD", "true");
    expect(isOfflineBuild()).toBe(true);
  });
});

describe("sitePageLinkProps", () => {
  it("keeps the site's own pages relative and in the same tab on the web", () => {
    expect(sitePageLinkProps("/security/")).toEqual({ href: "/security/" });
  });

  it("sends them to the live site in a new tab from the offline file", () => {
    // Relative, they would resolve against the user's disk.
    vi.stubEnv("VITE_OFFLINE_BUILD", "true");
    expect(sitePageLinkProps("/privacy/")).toEqual({
      href: "https://riskmapper.app/privacy/",
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });
});

describe("siteIconSrc", () => {
  it("is the shipped /icon.svg on the web", () => {
    expect(siteIconSrc()).toBe("/icon.svg");
  });

  it("is the data: URI the offline build supplies", () => {
    vi.stubEnv("VITE_OFFLINE_BUILD", "true");
    vi.stubEnv("VITE_OFFLINE_ICON_SRC", "data:image/svg+xml;base64,AAAA");
    expect(siteIconSrc()).toBe("data:image/svg+xml;base64,AAAA");
  });
});
