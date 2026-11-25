// @vitest-environment node
import { loadEnv, type ConfigEnv, type UserConfig, type UserConfigFnObject } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import siteConfig, { BUILD_ENV_PREFIX } from "./vite.config.mts";

/**
 * Signing hashes a build made on the signing laptop, and the deploy builds
 * its own and refuses to go live unless the two match byte for byte. A
 * VITE_DEBUG=false in the laptop's untracked .env.local once decided
 * whether every chunk logged to the console, so a build without that file
 * matched no signature. These pin the config that keeps the environment out
 * of `vite build` while `yarn dev` still reads it.
 */

const configFor = (command: ConfigEnv["command"]): UserConfig =>
  (siteConfig as UserConfigFnObject)({ command, mode: "production" });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("site build config", () => {
  it("reads no VITE_* variable from the shell or a .env file", () => {
    vi.stubEnv("VITE_DEBUG", "true");
    vi.stubEnv("VITE_CLOUD_SYNC_ENABLED", "false");

    const config = configFor("build");
    expect(config.envDir).toBe(false);
    expect(config.envPrefix).toBe(BUILD_ENV_PREFIX);
    expect(BUILD_ENV_PREFIX.startsWith("VITE_")).toBe(false);
    expect(loadEnv("production", process.cwd(), BUILD_ENV_PREFIX)).toEqual({});
  });

  it("pins debug logging off", () => {
    expect(configFor("build").define).toMatchObject({
      "import.meta.env.VITE_DEBUG": '"false"',
    });
  });

  it("still reads VITE_* settings in the dev server", () => {
    const config = configFor("serve");
    expect(config.envPrefix).toBe("VITE_");
    expect(config.envDir).toBeUndefined();
    expect(config.define).toBeUndefined();
  });
});
