import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import MatrixStatusIndicator from "./MatrixStatusIndicator";

/**
 * The two settled pills are the app's shortest explanation of where the data
 * lives, so each one has to reach the page that says it in full. The link is
 * asserted by rendered `href`, including the trailing slash, which is
 * load-bearing for WEBCAT's manifest lookup (MIGRATION.md D7).
 */

function renderPill(props: Parameters<typeof MatrixStatusIndicator>[0]) {
  return render(
    <TooltipProvider>
      <MatrixStatusIndicator {...props} />
    </TooltipProvider>,
  );
}

describe("MatrixStatusIndicator", () => {
  it("explains local-only storage and links to the security page", async () => {
    const user = userEvent.setup();
    renderPill({ shared: false, syncState: { kind: "idle" } });

    await user.click(screen.getByRole("button", { name: /saved locally/i }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/never leave your desk/i)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /protects your data/i }).getAttribute("href"),
    ).toBe("/security/");
  });

  it("sends people to the offline page in both explainers, not straight to the file", async () => {
    // The page explains how the single-file version differs before anyone
    // relies on it, so the explainers link there instead of downloading.
    const user = userEvent.setup();
    for (const props of [
      { shared: false, label: /saved locally/i },
      { shared: true, label: /end-to-end encrypted/i },
    ]) {
      const { unmount } = renderPill({ shared: props.shared, syncState: { kind: "idle" } });
      await user.click(screen.getByRole("button", { name: props.label }));
      const link = screen.getByRole("link", { name: /get the single-file version/i });
      expect(link.getAttribute("href")).toBe("/offline/");
      expect(link.hasAttribute("download")).toBe(false);
      expect(link.getAttribute("target")).toBeNull();
      unmount();
    }
  });

  it("explains end-to-end encryption and links to the security page", async () => {
    const user = userEvent.setup();
    renderPill({ shared: true, syncState: { kind: "idle" } });

    await user.click(screen.getByRole("button", { name: /end-to-end encrypted/i }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/encrypted in this browser/i)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /protects your data/i }).getAttribute("href"),
    ).toBe("/security/");
  });

  it("keeps the visible label inside the accessible name of the shared pill", () => {
    // WCAG 2.5.3: a voice user saying "End-to-end encrypted" has to hit it.
    renderPill({ shared: true, syncState: { kind: "idle" } });
    const pill = screen.getByRole("button", { name: /end-to-end encrypted/i });
    expect(pill.textContent).toContain("End-to-end encrypted");
  });

  it("still hands terminal failures to the action handler, not to an explainer", async () => {
    const user = userEvent.setup();
    const onIndicatorAction = vi.fn();
    renderPill({
      shared: true,
      syncState: { kind: "error", message: "Sync failed." },
      onIndicatorAction,
    });

    await user.click(screen.getByRole("button", { name: /sync failed/i }));

    expect(onIndicatorAction).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBe(null);
  });

  it("leaves mid-flight states as status text with nothing to click", () => {
    renderPill({ shared: true, syncState: { kind: "syncing" } });

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("button")).toBe(null);
  });
});

describe("MatrixStatusIndicator in the offline file", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("explains where the file keeps work and how to carry it to a newer copy", async () => {
    vi.stubEnv("VITE_OFFLINE_BUILD", "true");
    const user = userEvent.setup();
    renderPill({ shared: false, syncState: { kind: "idle" } });

    await user.click(screen.getByRole("button", { name: /saved locally/i }));

    expect(screen.getByText(/a file on your computer/i)).toBeTruthy();
    // Every Chromium browser shares file:// storage, not only Chrome, and
    // other files can rewrite the work as well as read it.
    expect(screen.getByText(/Chromium-based browsers, any HTML\s+file you open from your computer can read or change/i)).toBeTruthy();
    // Old work is left behind, not deleted.
    expect(screen.getByText(/old work stays in the browser/i)).toBeTruthy();
    // Names the export format by the label the Export menu uses.
    expect(screen.getByText(/RiskMapper\.app export format \(JSON\)/)).toBeTruthy();
    expect(screen.queryByText(/clear this site/i)).toBe(null);
  });

  it("links to the live security page in a new tab", async () => {
    vi.stubEnv("VITE_OFFLINE_BUILD", "true");
    const user = userEvent.setup();
    renderPill({ shared: false, syncState: { kind: "idle" } });

    await user.click(screen.getByRole("button", { name: /saved locally/i }));

    const link = screen.getByRole("link", { name: /protects your data/i });
    expect(link.getAttribute("href")).toBe("https://riskmapper.app/security/");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("does not point to the offline page inside the offline file itself", async () => {
    vi.stubEnv("VITE_OFFLINE_BUILD", "true");
    const user = userEvent.setup();
    renderPill({ shared: false, syncState: { kind: "idle" } });

    await user.click(screen.getByRole("button", { name: /saved locally/i }));

    expect(screen.queryByRole("link", { name: /single-file version/i })).toBe(null);
  });
});
