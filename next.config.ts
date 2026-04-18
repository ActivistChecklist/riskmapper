import type { NextConfig } from "next";

/** Set in CI for GitHub project Pages (site served under /repo-name). */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  ...(basePath
    ? { basePath, trailingSlash: true }
    : {}),
};

export default nextConfig;
