import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "./PrivacyPage";

/**
 * The privacy page's rendered content. Its head tags moved to
 * `privacy/index.html` when the `metadata` export went away, and are
 * asserted in client/head.test.ts.
 */

describe("PrivacyPage", () => {
  it("renders a single top-level heading", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeTruthy();
  });

  it("links back to the app root", () => {
    render(<PrivacyPage />);
    const back = screen.getByRole("link", { name: /back to risk mapper/i });
    expect(back.getAttribute("href")).toBe("/");
  });

  it("links to the source repository so claims are verifiable", () => {
    render(<PrivacyPage />);
    const repo = screen.getByRole("link", {
      name: /github\.com\/ActivistChecklist\/riskmapper/i,
    });
    expect(repo.getAttribute("href")).toBe(
      "https://github.com/ActivistChecklist/riskmapper",
    );
    expect(repo.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("shows a last-updated date", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/last updated/i)).toBeTruthy();
  });

  it("documents the sections a reader needs", () => {
    render(<PrivacyPage />);
    for (const name of [
      /what we do not collect/i,
      /what we do collect/i,
      /how we anonymize your ip/i,
      /verify any of this/i,
    ]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeTruthy();
    }
  });

  it("lists every analytics event by name", () => {
    render(<PrivacyPage />);
    for (const event of [
      "pageview",
      "share_matrix",
      "copy_worksheet",
      "download_pdf",
      "first_pool_item",
      "first_grid_item",
      "first_mitigation_typed",
    ]) {
      expect(screen.getByText(event)).toBeTruthy();
    }
  });
});
