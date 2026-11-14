import { describe, expect, it } from "vitest";
import { isPublicPath, opensSignedOut } from "./public-paths";

describe("isPublicPath", () => {
  it.each([
    "/login",
    "/login/",
    "/reset",
    "/reset/abc",
    "/email-change/abc",
    "/api/auth/email-change/confirm",
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
    // Vercel Blob's signed upload callback; the route checks the session for token requests.
    "/api/w/123/blobs/token",
    "/pdfjs/cmaps/x.bcmap",
    "/_next/static/chunks/app.js",
    // A project link's preview card and company icon, for link unfurlers.
    "/p/123/opengraph-image",
    "/p/123/twitter-image",
    "/api/p/123/brand/icon",
  ])("lets anyone open %s", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each([
    "/",
    "/f/default",
    "/p/123",
    "/admin",
    "/account",
    "/account/profile",
    "/api/account/profile",
    "/api/account/sessions",
    "/email-changes",
    "/api/capture",
    "/api/w/123/projects",
    "/api/w/123/blobs/commit",
    "/api/w/123/blobs/token/x",
    "/api/w/123/projects/p/blobs/token",
    "/loginx",
    "/sx",
    "/sandboxed",
    "/px/other",
    "/api/authz",
    "/api/shares-admin",
    // Nothing else of a project: not its other routes, its API, nor its logo file.
    "/p/123/opengraph-image/x",
    "/p/123/x",
    "/p/opengraph-image",
    "/api/p/123",
    "/api/p/123/brand/logo",
    "/api/p/123/brand/icon/x",
  ])("needs a session for %s", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});

describe("opensSignedOut", () => {
  it.each(["/p/123", "/p/123/", "/p/3f1c9a52-7d1e-4b6a-9c2f-0a8b7e6d5c4b"])(
    "lets %s answer a signed-out browser itself",
    (path) => {
      expect(opensSignedOut(path)).toBe(true);
    },
  );

  it.each(["/", "/p", "/p/", "/p/123/x", "/p/123/opengraph-image", "/f/123", "/px/123"])(
    "sends a signed-out browser from %s to sign in",
    (path) => {
      expect(opensSignedOut(path)).toBe(false);
    },
  );
});
