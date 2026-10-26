import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Trace from the monorepo root: pnpm keeps dependencies behind symlinks into the root's
  // node_modules/.pnpm, and functions traced from apps/demo alone ship those links unresolved.
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  // The e2e suite builds into its own folder so it never clobbers a dev or prod build.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Linting runs through the monorepo's ESLint flat config (`pnpm lint`).
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  // Always defined at build time, so production builds fold away the e2e-only hooks it gates.
  env: { NEXT_PUBLIC_SQUINT_E2E: process.env.NEXT_PUBLIC_SQUINT_E2E ?? "0" },
  // @sparticuz/chromium finds its browser in bin/ next to its own files, so it can't be bundled.
  serverExternalPackages: ["@sparticuz/chromium"],
  // ...and file tracing can't see bin/. It sits in apps/demo/node_modules with pnpm's default
  // layout, and in the root node_modules with the hoisted layout Vercel builds use.
  outputFileTracingIncludes: {
    "/api/capture": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "../../node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/s/[token]/capture": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "../../node_modules/@sparticuz/chromium/bin/**",
    ],
    // Link preview cards read Figtree with fs at render time; tracing misses it on some builds.
    "/opengraph-image": ["./assets/fonts/**"],
    "/twitter-image": ["./assets/fonts/**"],
    "/s/opengraph-image": ["./assets/fonts/**"],
    "/s/twitter-image": ["./assets/fonts/**"],
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
