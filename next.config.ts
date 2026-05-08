import path from "node:path";
import type { NextConfig } from "next";

const yjsResolved = path.resolve(process.cwd(), "node_modules/yjs");

const nextConfig: NextConfig = {
  // The cloud-sync API lives under app/api/* and runs on the Node runtime,
  // so this app is no longer statically exportable.
  turbopack: {
    resolveAlias: {
      // Turbopack treats absolute paths in resolveAlias as server-relative
      // and rejects them; it accepts paths relative to the project root.
      yjs: "./node_modules/yjs",
    },
  },
  webpack: (config) => {
    // One physical copy of yjs — duplicate instances break Y.* constructor checks
    // (see https://github.com/yjs/yjs/issues/438).
    config.resolve.alias = {
      ...config.resolve.alias,
      yjs: yjsResolved,
    };
    return config;
  },
};

export default nextConfig;
