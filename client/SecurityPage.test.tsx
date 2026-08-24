import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RETENTION_DAYS } from "@/components/risk-matrix/cloudConfig";
import SecurityPage from "./SecurityPage";

/**
 * The security page's rendered content. Its head tags live in
 * `security/index.html` and are asserted in client/head.test.ts.
 *
 * These assertions are deliberately about promises rather than prose. Each
 * one names a property the code actually has, so that removing the property
 * without removing the claim fails here.
 */

describe("SecurityPage", () => {
  it("renders a single top-level heading", () => {
    render(<SecurityPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Security" }),
    ).toBeTruthy();
  });

  it("links back to the app root", () => {
    render(<SecurityPage />);
    expect(
      screen.getByRole("link", { name: /back to risk mapper/i }).getAttribute("href"),
    ).toBe("/");
  });

  it("shows a last-updated date", () => {
    render(<SecurityPage />);
    expect(screen.getByText(/last updated/i)).toBeTruthy();
  });

  it("documents the sections a reader needs", () => {
    render(<SecurityPage />);
    for (const name of [
      /stays in your browser by default/i,
      /share by link/i,
      /keep the link safe/i,
      /the code you run is signed/i,
      /what this does not protect against/i,
      /check for yourself/i,
    ]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
    }
  });

  it("promises calendar-day granularity, never times of day", () => {
    // The server stores `createdAt` as a UTC calendar day and sets each
    // update row's `_id` explicitly so no ObjectId can smuggle a
    // second-precision timestamp back in. If that ever regresses, this
    // claim becomes false. See lib/cloud/types.ts.
    render(<SecurityPage />);
    expect(screen.getByText(/never times of day/i)).toBeTruthy();
  });

  it("says plainly that the host keeps ordinary server logs", () => {
    // Access logs carry real timestamps and IPs and sit outside our schema.
    // THREAT-MODEL.md refuses to claim there is "nothing" responsive to a
    // subpoena; this page must not claim it either.
    render(<SecurityPage />);
    expect(
      screen.getByText(/our web host keeps ordinary server logs/i),
    ).toBeTruthy();
  });

  it("quotes the retention window from the shared constant", () => {
    // The share dialog quotes the same number; drift between them would be
    // a promise the server does not keep.
    render(<SecurityPage />);
    expect(
      screen.getByText(new RegExp(`${RETENTION_DAYS} days with no activity`)),
    ).toBeTruthy();
  });

  it("explains WEBCAT code signing and links to it", () => {
    render(<SecurityPage />);
    const webcat = screen.getByRole("link", { name: "WEBCAT" });
    expect(webcat.getAttribute("href")).toBe(
      "https://github.com/freedomofpress/webcat",
    );
    expect(webcat.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("links to the threat model for the long-form limits", () => {
    render(<SecurityPage />);
    expect(
      screen.getByRole("link", { name: /threat model/i }).getAttribute("href"),
    ).toBe(
      "https://github.com/ActivistChecklist/riskmapper/blob/main/THREAT-MODEL.md",
    );
  });

  it("links to the privacy page for collection questions", () => {
    render(<SecurityPage />);
    expect(
      screen.getByRole("link", { name: "Privacy" }).getAttribute("href"),
    ).toBe("/privacy/");
  });

  it("links to the source repository so claims are verifiable", () => {
    render(<SecurityPage />);
    const repo = screen.getByRole("link", {
      name: "github.com/ActivistChecklist/riskmapper",
    });
    expect(repo.getAttribute("href")).toBe(
      "https://github.com/ActivistChecklist/riskmapper",
    );
    expect(repo.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
