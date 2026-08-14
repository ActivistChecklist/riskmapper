import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "./NotFound";

/**
 * The not-found view. Rendered client-side by `index.html` for any path the
 * server could not match to a file, because WEBCAT resolves unmanifested
 * main_frame paths through a single `default_fallback` document. See
 * MIGRATION.md decision D3.
 */

describe("NotFound", () => {
  it("names the problem in a heading", () => {
    render(<NotFound />);
    expect(
      screen.getByRole("heading", { name: /page not found/i }),
    ).toBeTruthy();
  });

  it("offers a route back to the app root", () => {
    render(<NotFound />);
    const back = screen.getByRole("link", { name: /back to risk mapper/i });
    expect(back.getAttribute("href")).toBe("/");
  });
});
