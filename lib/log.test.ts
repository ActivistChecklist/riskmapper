import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `lib/log.ts` computes its enabled flag once at module load from
 * `import.meta.env.VITE_DEBUG`, so each case stubs the env first and
 * re-imports. That load-time read is the part a bundler swap breaks
 * silently (a quiet production build going noisy, or vice versa), which
 * is what these assertions guard.
 *
 * Note the limit of this coverage: vitest runs in Node, so a `process.env`
 * read would pass here and still fail in the browser, where `process` does
 * not exist. Only a real build catches that.
 */

async function importLog() {
  return import("./log");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createLogger", () => {
  it("prefixes the bracketed tag and routes each level to its console method", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const { createLogger } = await importLog();
    const log = createLogger("rmsync");

    log.info("connected");
    log.warn("retrying");
    log.error("gave up");

    expect(info).toHaveBeenCalledWith("[rmsync]", "connected");
    expect(warn).toHaveBeenCalledWith("[rmsync]", "retrying");
    expect(error).toHaveBeenCalledWith("[rmsync]", "gave up");
  });

  it("passes a fields object through as a third argument", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { createLogger } = await importLog();

    createLogger("share").info("imported", { seq: 7 });

    expect(info).toHaveBeenCalledWith("[share]", "imported", { seq: 7 });
  });

  it("omits the third argument entirely when there are no fields", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { createLogger } = await importLog();

    createLogger("share").info("imported");

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]).toHaveLength(2);
  });

  it("keeps loggers independent so tags don't leak between features", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { createLogger } = await importLog();

    createLogger("a").info("x");
    createLogger("b").info("y");

    expect(info).toHaveBeenNthCalledWith(1, "[a]", "x");
    expect(info).toHaveBeenNthCalledWith(2, "[b]", "y");
  });

  it("is enabled by default", async () => {
    vi.stubEnv("VITE_DEBUG", undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { createLogger } = await importLog();

    createLogger("t").info("noisy");

    expect(info).toHaveBeenCalledTimes(1);
  });

  it("goes silent at every level when VITE_DEBUG is \"false\"", async () => {
    vi.stubEnv("VITE_DEBUG", "false");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const { createLogger } = await importLog();
    const log = createLogger("t");
    log.info("a");
    log.warn("b");
    log.error("c");

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("stays enabled for values other than \"false\"", async () => {
    vi.stubEnv("VITE_DEBUG", "true");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { createLogger } = await importLog();

    createLogger("t").info("noisy");

    expect(info).toHaveBeenCalledTimes(1);
  });
});
