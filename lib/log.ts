/**
 * Centralized client-side debug logging.
 *
 * Each call lands in DevTools as:
 *
 *     [<tag>] <event>  { …fields }
 *
 * Filter the console by tag (e.g. `[rmsync]`) to slice one feature's
 * timeline out of the noise. Severity maps to console.info / .warn /
 * .error so DevTools' level filters keep working.
 *
 * Disabled when `NEXT_PUBLIC_DEBUG=false`. Otherwise enabled by
 * default (dev). Set `NEXT_PUBLIC_DEBUG=false` for production builds
 * that should ship quiet.
 */

type Level = "info" | "warn" | "error";

const ENABLED = (() => {
  if (typeof process === "undefined") return true;
  if (process.env.NEXT_PUBLIC_DEBUG === "false") return false;
  return true;
})();

export type Logger = {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
};

/**
 * Build a tagged logger. Pass a short tag like `"rmsync"` or `"share"`
 * — it'll be wrapped in brackets so consumers can grep `[rmsync]`.
 */
export function createLogger(tag: string): Logger {
  const prefix = `[${tag}]`;
  return {
    info(event, fields) {
      emit("info", prefix, event, fields);
    },
    warn(event, fields) {
      emit("warn", prefix, event, fields);
    },
    error(event, fields) {
      emit("error", prefix, event, fields);
    },
  };
}

function emit(
  level: Level,
  prefix: string,
  event: string,
  fields?: Record<string, unknown>,
): void {
  if (!ENABLED) return;
  const fn =
    level === "info"
      ? console.info
      : level === "warn"
        ? console.warn
        : console.error;
  if (fields !== undefined) fn(prefix, event, fields);
  else fn(prefix, event);
}
