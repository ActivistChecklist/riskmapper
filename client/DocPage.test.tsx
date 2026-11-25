import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocPage, scrollToFragment } from "./DocPage";

/**
 * The shared shell's own behaviour. Each page's content is tested beside
 * that page (PrivacyPage, SecurityPage, OfflinePage).
 */

const scrollIntoView = vi.fn();

beforeEach(() => {
  // jsdom lays nothing out, so it has no scrollIntoView to call.
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  scrollIntoView.mockReset();
  window.history.replaceState(null, "", "/");
});

function renderDoc() {
  return render(
    <DocPage title="Doc" lastUpdated="today">
      {`
Intro.

## Use Risk Mapper with no internet

Section body.
`}
    </DocPage>,
  );
}

describe("DocPage", () => {
  it("scrolls to the section the URL names once it has rendered", () => {
    // Older offline copies link to this anchor on the Security page. The
    // heading only exists after React renders, too late for the browser's
    // own scroll on load.
    window.history.replaceState(null, "", "/security/#use-risk-mapper-with-no-internet");
    renderDoc();
    const heading = screen.getByRole("heading", { level: 2, name: /no internet/i });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(heading);
  });

  it("leaves the scroll alone with no fragment", () => {
    window.history.replaceState(null, "", "/security/");
    renderDoc();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("ignores a fragment that names nothing on the page", () => {
    window.history.replaceState(null, "", "/security/#no-such-section");
    renderDoc();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("treats a bare # as no fragment", () => {
    expect(() => scrollToFragment("#")).not.toThrow();
    expect(() => scrollToFragment("")).not.toThrow();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
