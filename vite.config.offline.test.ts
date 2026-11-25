// @vitest-environment node
import { loadEnv, type UserConfig } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import offlineConfig, { OFFLINE_ENV_PREFIX } from "./vite.config.offline.mts";

/**
 * Signing hashes a local build of the offline file, and the deploy builds
 * its own and refuses to go live unless the two match. The first signed
 * release with the offline file never deployed: the signing laptop had no
 * VITE_DEBUG in its shell, the deploy's build did, and the offline file came
 * out with debug logging on in one and off in the other. These pin the
 * config that keeps the shell out of this build.
 */

const config = offlineConfig as UserConfig;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("offline build config", () => {
  it("reads no VITE_* variable from the shell or a .env file", () => {
    vi.stubEnv("VITE_DEBUG", "true");
    vi.stubEnv("VITE_CLOUD_SYNC_ENABLED", "true");

    expect(config.envDir).toBe(false);
    expect(config.envPrefix).toBe(OFFLINE_ENV_PREFIX);
    expect(OFFLINE_ENV_PREFIX.startsWith("VITE_")).toBe(false);
    expect(loadEnv("production", process.cwd(), OFFLINE_ENV_PREFIX)).toEqual({});
  });

  it("pins every flag the app reads, debug logging off like the website", () => {
    expect(config.define).toMatchObject({
      "import.meta.env.VITE_OFFLINE_BUILD": '"true"',
      "import.meta.env.VITE_CLOUD_SYNC_ENABLED": '"false"',
      "import.meta.env.VITE_DEBUG": '"false"',
    });
  });
});
