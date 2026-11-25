import release from "@/release.json";

/**
 * When this build was made, as YYYY-MM-DD. Written by `yarn webcat:sign`
 * (scripts/releaseDate.mjs), never read from the clock during the build, so
 * every build of the same commit is byte-for-byte the same.
 */
export const BUILT_ON: string = release.builtOn;

/** Midnight UTC on the build date, in milliseconds. */
export function builtOnMs(date: string = BUILT_ON): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** "November 24, 2026". Formatted in UTC so it never shifts a day. */
export function builtOnLabel(date: string = BUILT_ON): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
    builtOnMs(date),
  );
}
