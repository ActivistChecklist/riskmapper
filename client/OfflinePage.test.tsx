import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OFFLINE_DOWNLOAD_PATH } from "@/lib/offlinePaths.mts";
import { builtOnLabel } from "@/lib/releaseDate";
import OfflinePage from "./OfflinePage";

/**
 * The offline page's rendered content. Its head tags live in
 * `offline/index.html` and are asserted in client/head.test.ts.
 */

describe("OfflinePage", () => {
  it("renders a single top-level heading", () => {
    render(<OfflinePage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Use Risk Mapper offline" }),
    ).toBeTruthy();
  });

  it("links back to the app root", () => {
    render(<OfflinePage />);
    expect(
      screen.getByRole("link", { name: /back to risk mapper/i }).getAttribute("href"),
    ).toBe("/");
  });

  it("shows a last-updated date", () => {
    render(<OfflinePage />);
    expect(screen.getByText(/last updated/i)).toBeTruthy();
  });

  it("puts the latest copy, with its download button, before any section", () => {
    render(<OfflinePage />);
    const box = screen.getByRole("region", { name: /latest offline copy/i });
    expect(box.textContent).toContain(`built ${builtOnLabel()}`);
    const firstSection = screen.getByRole("heading", {
      level: 2,
      name: /check a copy someone gave you/i,
    });
    expect(
      box.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("offers the download the build produces, styled as a button", () => {
    // The server sends this path as an attachment; see server/staticFiles.ts.
    render(<OfflinePage />);
    const box = screen.getByRole("region", { name: /latest offline copy/i });
    const download = screen.getByRole("link", { name: /download the offline copy/i });
    expect(box.contains(download)).toBe(true);
    expect(download.getAttribute("href")).toBe(OFFLINE_DOWNLOAD_PATH);
    expect(download.hasAttribute("download")).toBe(true);
    expect(download.className).toMatch(/bg-rm-primary/);
    expect(OFFLINE_DOWNLOAD_PATH).toBe("/download/riskmapper-offline.html");
  });

  it("gives the fingerprint beside the download", () => {
    render(<OfflinePage />);
    const box = screen.getByRole("region", { name: /latest offline copy/i });
    const links = [...box.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      "/download/riskmapper-offline.html",
      "/download/riskmapper-offline.html.sha256",
    ]);
  });

  it("publishes a checksum on this site for checking a copy someone hands over", () => {
    // The file's protections can be edited out of a copy, so the page has to
    // give a way to check one against bytes served by us.
    render(<OfflinePage />);
    expect(
      screen.getByRole("link", { name: /the one we publish/i }).getAttribute("href"),
    ).toBe("/download/riskmapper-offline.html.sha256");
    expect(screen.getByText(/shasum -a 256 riskmapper-offline.html/)).toBeTruthy();
  });

  it("explains how the offline copy differs from the website", () => {
    render(<OfflinePage />);
    expect(
      screen.getByRole("heading", { level: 2, name: /how it differs from the website/i }),
    ).toBeTruthy();
    expect(screen.getByText(/share by link is not available/i)).toBeTruthy();
    expect(screen.getByText(/does not update itself/i)).toBeTruthy();
  });

  it("links to the Security page for what WEBCAT does", () => {
    render(<OfflinePage />);
    expect(
      screen.getByRole("link", { name: "Security page" }).getAttribute("href"),
    ).toBe("/security/");
  });
});
