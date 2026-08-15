import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * React Testing Library only auto-registers its cleanup when Vitest runs
 * with `globals: true`. We don't, so unmount explicitly — otherwise every
 * `render()` in a file stacks up in the same document and role queries
 * start failing with "found multiple elements".
 */
afterEach(() => {
  cleanup();
});
