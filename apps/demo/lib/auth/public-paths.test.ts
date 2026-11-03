import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

describe("isPublicPath", () => {
  it.each([
    "/login",
    "/login/",
    "/reset",
    "/reset/abc",
    "/s/token123",
    "/s/opengraph-image",
    "/s/twitter-image",
    "/px/s/token/page",
    "/embed/x",
    "/opengraph-image",
    "/twitter-image",
    "/icon.svg",
    "/sandbox",
    "/review-link",
    "/api/pinpoint",
    "/api/frame-check",
    "/api/shares",
    "/api/shares/abc/manifest",
    "/api/s/token/comments",
    "/api/cron/expire",
    "/api/auth/login",
    "/api/auth/reset/complete",
    "/pdfjs/cmaps/x.bcmap",
    "/_next/static/chunks/app.js",
  ])("lets anyone open %s", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each([
    "/",
    "/f/default",
    "/p/123",
    "/admin",
    "/account",
    "/api/capture",
    "/api/w/123/projects",
    "/loginx",
    "/sx",
    "/sandboxed",
    "/px/other",
    "/api/authz",
    "/api/shares-admin",
  ])("needs a session for %s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});
