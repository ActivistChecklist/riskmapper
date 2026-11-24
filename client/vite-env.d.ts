/// <reference types="vite/client" />

/**
 * Client-visible env vars. Only the `VITE_` prefix is exposed to the browser
 * bundle (see `envPrefix` in vite.config.ts); server-side config lives in
 * `lib/cloud/config.ts` and reads `process.env` instead.
 *
 * All optional: each call site defines the default when the var is unset.
 */
interface ImportMetaEnv {
  /** "false" hides every share-to-cloud affordance. Default: enabled. */
  readonly VITE_CLOUD_SYNC_ENABLED?: string;
  /** Absolute base URL for the cloud API. Default: same-origin relative. */
  readonly VITE_CLOUD_API_URL?: string;
  /** "false" silences lib/log.ts. Default: enabled. */
  readonly VITE_DEBUG?: string;
  /** "true" only in the single-file offline build. See lib/offlineBuild.ts. */
  readonly VITE_OFFLINE_BUILD?: string;
  /** The offline build's logo as a data: URI. See `siteIconSrc`. */
  readonly VITE_OFFLINE_ICON_SRC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
