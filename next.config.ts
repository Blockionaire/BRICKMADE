import type { NextConfig } from "next";

const pagesBuild = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  ...(pagesBuild
    ? {
        output: "export",
        basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};
export default nextConfig;
