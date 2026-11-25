import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { builtOnLabel } from "@/lib/releaseDate";
import { Footer } from "./Footer";

/**
 * The Privacy link is a `next/link`; the outbound ones are plain anchors.
 * Asserting on rendered `href`/`rel`/`target` rather than on the component
 * used means these survive swapping `next/link` for whatever the router
 * ends up being.
 */

describe("Footer", () => {
  it("links to the privacy page at its canonical path, with the trailing slash", () => {
    render(<Footer />);
    const privacy = screen.getByRole("link", { name: /privacy/i });
    // The slash is not cosmetic: the privacy page is a directory-index
    // document, and a slashless path resolves to the SPA instead. It also
    // has to stay this way for WEBCAT, whose manifest lookup only applies
    // `default_index` to paths ending in `/`. See MIGRATION.md D7.
    expect(privacy.getAttribute("href")).toBe("/privacy/");
  });

  it("links to the security page at its canonical path, with the trailing slash", () => {
    render(<Footer />);
    // Same directory-index reasoning as the privacy link above.
    expect(
      screen.getByRole("link", { name: /security/i }).getAttribute("href"),
    ).toBe("/security/");
  });

  it("links to the offline page, in the same tab", () => {
    render(<Footer />);
    const offline = screen.getByRole("link", { name: "Use this site fully offline" });
    // Directory-index document, so the trailing slash matters here too.
    expect(offline.getAttribute("href")).toBe("/offline/");
    expect(offline.getAttribute("target")).toBeNull();
  });

  it("keeps the privacy link in-app (no new tab, no rel)", () => {
    render(<Footer />);
    const privacy = screen.getByRole("link", { name: /privacy/i });
    expect(privacy.getAttribute("target")).toBeNull();
  });

  it("links to the source repository in a new tab, safely", () => {
    render(<Footer />);
    const github = screen.getByRole("link", { name: /source on github/i });
    expect(github.getAttribute("href")).toBe(
      "https://github.com/ActivistChecklist/riskmapper",
    );
    expect(github.getAttribute("target")).toBe("_blank");
    expect(github.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("credits Activist Checklist with a safe outbound link", () => {
    render(<Footer />);
    const credit = screen.getByRole("link", { name: /activist checklist/i });
    expect(credit.getAttribute("href")).toBe("https://activistchecklist.org/");
    expect(credit.getAttribute("target")).toBe("_blank");
    expect(credit.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("exposes the site nav as a labelled landmark", () => {
    render(<Footer />);
    expect(screen.getByRole("navigation", { name: /site/i })).toBeTruthy();
  });
});

describe("Footer in the offline file", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("says it is the offline copy, and when it was built", () => {
    // The date to compare with the Security page's latest copy.
    vi.stubEnv("VITE_OFFLINE_BUILD", "true");
    render(<Footer />);
    expect(screen.getByText("Offline copy")).toBeTruthy();
    expect(screen.getByRole("contentinfo").textContent).toContain(`built ${builtOnLabel()}`);
  });

  it("sends the Security and Privacy links to the live site in a new tab", () => {
    // A relative /privacy/ would resolve against the user's disk.
    vi.stubEnv("VITE_OFFLINE_BUILD", "true");
    render(<Footer />);
    for (const [name, href] of [
      [/security/i, "https://riskmapper.app/security/"],
      [/privacy/i, "https://riskmapper.app/privacy/"],
    ] as const) {
      const link = screen.getByRole("link", { name });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("leaves out the offline link, since the file is already offline", () => {
    vi.stubEnv("VITE_OFFLINE_BUILD", "true");
    render(<Footer />);
    expect(screen.queryByRole("link", { name: /fully offline/i })).toBe(null);
  });

  it("shows no offline label on the website", () => {
    render(<Footer />);
    expect(screen.queryByText("Offline copy")).toBe(null);
  });
});
