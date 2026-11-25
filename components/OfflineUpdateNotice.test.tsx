import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builtOnLabel, builtOnMs } from "@/lib/releaseDate";
import { OfflineUpdateNotice } from "./OfflineUpdateNotice";

const DAY = 24 * 60 * 60 * 1000;
let meta: HTMLMetaElement;

beforeEach(() => {
  window.localStorage.clear();
  meta = document.createElement("meta");
  meta.name = "riskmapper-offline-build";
  meta.content = "build-1";
  document.head.append(meta);
  // Only the clock is faked, so user-event's timers still run.
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  meta.remove();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

/** Set today to `days` after this build's date. */
const daysAfterBuild = (days: number) => vi.setSystemTime(builtOnMs() + days * DAY);
const notice = () => screen.queryByRole("complementary", { name: /update notice/i });

describe("OfflineUpdateNotice", () => {
  it("names the build date and links to the latest copy once it is over a month old", () => {
    vi.stubEnv("VITE_OFFLINE_BUILD", "true");
    daysAfterBuild(45);
    render(<OfflineUpdateNotice />);

    expect(notice()?.textContent).toContain(`built on ${builtOnLabel()}, more than a month`);
    const link = screen.getByRole("link", { name: /check for a newer version/i });
    // The offline page, which shows the latest build date, on the live
    // site, in a new tab so the app stays open.
    expect(link.getAttribute("href")).toBe("https://riskmapper.app/offline/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("stays hidden for a build less than a month old", () => {
    vi.stubEnv("VITE_OFFLINE_BUILD", "true");
    daysAfterBuild(10);
    render(<OfflineUpdateNotice />);
    expect(notice()).toBe(null);
  });

  it("goes away on Dismiss and stays away on the next visit", async () => {
    vi.stubEnv("VITE_OFFLINE_BUILD", "true");
    daysAfterBuild(45);
    const user = userEvent.setup();
    const { unmount } = render(<OfflineUpdateNotice />);

    await user.click(screen.getByRole("button", { name: /dismiss update notice/i }));
    expect(notice()).toBe(null);

    unmount();
    render(<OfflineUpdateNotice />);
    expect(notice()).toBe(null);
  });

  it("never renders on the website", () => {
    daysAfterBuild(400);
    render(<OfflineUpdateNotice />);
    expect(notice()).toBe(null);
  });
});
