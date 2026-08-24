import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
