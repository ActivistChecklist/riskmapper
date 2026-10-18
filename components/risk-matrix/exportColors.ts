import type { ColorGroupKey } from "./types";

/**
 * Light-theme values of the tier tokens in client/globals.css, for exports
 * that can't read CSS variables (clipboard HTML, PDF). Keep in sync with
 * --rm-{tier}-text and --rm-{tier}-strong.
 */
export const TIER_TEXT_HEX: Record<ColorGroupKey, string> = {
  red: "#b42318",
  orange: "#a8480a",
  yellow: "#7a5d00",
  green: "#1f7a3a",
};

export const TIER_STRIPE_HEX: Record<ColorGroupKey, string> = {
  red: "#ef6f6f",
  orange: "#f2934a",
  yellow: "#e4c23d",
  green: "#4ccd7a",
};

/** --rm-muted-2: the step 3 question prompts. */
export const PROMPT_HEX = "#71717a";
