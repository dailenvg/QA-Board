import path from "node:path";
import type { NextConfig } from "next";

/**
 * Next streams a page's metadata into the body for most visitors and puts it in <head> only
 * for the bots it lists. Link unfurlers that read <head> alone would miss a review or project
 * link's card, so this is Next 15's own list plus the unfurlers Squint links meet (ClickUp,
 * Iframely, Embedly, and anything calling itself a bot, preview or unfurler).
 */
const NEXT_HTML_LIMITED_BOTS =
  "[\\w-]+-Google|Google-[\\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight";
const UNFURLERS = "ClickUp|Iframely|Embedly|bot\\b|preview|unfurl";

const config: NextConfig = {
  htmlLimitedBots: new RegExp(`${NEXT_HTML_LIMITED_BOTS}|${UNFURLERS}`, "i"),
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
  // @sparticuz/chromium-min must stay unbundled (its docs require it). It downloads Chromium at
  // runtime, so there are no binaries to add to the trace. @node-rs/argon2 loads a native
  // binding per platform, which webpack can't bundle.
  serverExternalPackages: ["@sparticuz/chromium-min", "@node-rs/argon2"],
  outputFileTracingIncludes: {
    // Link preview cards read Figtree with fs at render time; tracing misses it on some builds.
    "/opengraph-image": ["./assets/fonts/**"],
    "/twitter-image": ["./assets/fonts/**"],
    "/s/opengraph-image": ["./assets/fonts/**"],
    "/s/twitter-image": ["./assets/fonts/**"],
    // A workspace's review link card, per token (`*` is the [token] segment).
    "/s/*/opengraph-image": ["./assets/fonts/**"],
    "/s/*/twitter-image": ["./assets/fonts/**"],
    // A project link's card and company icon, per project (`*` is the [id] segment).
    "/p/*/opengraph-image": ["./assets/fonts/**"],
    "/p/*/twitter-image": ["./assets/fonts/**"],
    "/api/p/*/brand/icon": ["./assets/fonts/**"],
  },
  // Shared review links: never indexed, never leak the token through Referer.
  async headers() {
    const noIndex = { key: "X-Robots-Tag", value: "noindex, nofollow" };
    const privateLink = [{ key: "Referrer-Policy", value: "no-referrer" }, noIndex];
    return [
      { source: "/s/:path*", headers: privateLink },
      { source: "/api/s/:path*", headers: privateLink },
      { source: "/api/shares/:path*", headers: privateLink },
      // A project link's card and company icon: never indexed (the page says so itself).
      { source: "/p/:id/opengraph-image", headers: [noIndex] },
      { source: "/p/:id/twitter-image", headers: [noIndex] },
      { source: "/api/p/:path*", headers: [noIndex] },
      // Password reset links: same-origin rather than no-referrer, so the token still never
      // leaves in a Referer but the form's posts keep their Origin (no-referrer makes it "null",
      // which the auth routes refuse as cross-site).
      {
        source: "/reset/:path*",
        headers: [
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // Email change links: the same, for the same reasons.
      {
        source: "/email-change/:path*",
        headers: [
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  // Migrations under migrations/ are imported as text.
  webpack(webpackConfig: { module: { rules: unknown[] } }) {
    webpackConfig.module.rules.push({ test: /\.sql$/, type: "asset/source" });
    return webpackConfig;
  },
};

export default config;
