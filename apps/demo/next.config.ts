import type { NextConfig } from "next";

const config: NextConfig = {
  // The e2e suite builds into its own folder so it never clobbers a dev or prod build.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Linting runs through the monorepo's ESLint flat config (`pnpm lint`).
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  // @sparticuz/chromium unpacks its browser from bin/ at runtime, which file tracing can't see.
  outputFileTracingIncludes: { "/api/capture": ["./node_modules/@sparticuz/chromium/bin/**"] },
};

export default config;
