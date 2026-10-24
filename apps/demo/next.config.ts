import type { NextConfig } from "next";

const config: NextConfig = {
  // The e2e suite builds into its own folder so it never clobbers a dev or prod build.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Linting runs through the monorepo's ESLint flat config (`pnpm lint`).
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  // Always defined at build time, so production builds fold away the e2e-only hooks it gates.
  env: { NEXT_PUBLIC_SQUINT_E2E: process.env.NEXT_PUBLIC_SQUINT_E2E ?? "0" },
  // @sparticuz/chromium unpacks its browser from bin/ at runtime, which file tracing can't see.
  outputFileTracingIncludes: {
    "/api/capture": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/s/[token]/capture": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  // Shared review links: never indexed, never leak the token through Referer.
  async headers() {
    const privateLink = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return [
      { source: "/s/:path*", headers: privateLink },
      { source: "/api/s/:path*", headers: privateLink },
      { source: "/api/shares/:path*", headers: privateLink },
    ];
  },
  // Migrations under migrations/ are imported as text.
  webpack(webpackConfig: { module: { rules: unknown[] } }) {
    webpackConfig.module.rules.push({ test: /\.sql$/, type: "asset/source" });
    return webpackConfig;
  },
};

export default config;
