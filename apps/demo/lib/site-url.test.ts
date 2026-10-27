import { describe, expect, it } from "vitest";
import { PRODUCTION_SITE_URL, siteUrl } from "./site-url";

describe("siteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL over everything else", () => {
    const url = siteUrl({
      NEXT_PUBLIC_SITE_URL: "https://review.example.com",
      VERCEL_ENV: "production",
      VERCEL_URL: "squint-abc123.vercel.app",
    });
    expect(url.href).toBe("https://review.example.com/");
  });

  it("adds https to a configured host without a scheme, and ignores blank values", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "review.example.com" }).href).toBe(
      "https://review.example.com/",
    );
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "  " }).href).toBe("http://localhost:3000/");
  });

  it("keeps an explicit http origin, such as a local tunnel", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100" }).href).toBe(
      "http://127.0.0.1:3100/",
    );
  });

  it("uses the custom domain's www host on production builds", () => {
    const url = siteUrl({ VERCEL_ENV: "production", VERCEL_URL: "squint-abc123.vercel.app" });
    expect(url.href).toBe(`${PRODUCTION_SITE_URL}/`);
    // The host Vercel serves, not the bare domain that redirects to it.
    expect(url.href).toBe("https://www.squintreview.com/");
  });

  it("uses the deployment host on preview and development Vercel builds", () => {
    expect(siteUrl({ VERCEL_ENV: "preview", VERCEL_URL: "squint-abc123.vercel.app" }).href).toBe(
      "https://squint-abc123.vercel.app/",
    );
    expect(siteUrl({ VERCEL_URL: "squint-dev.vercel.app" }).href).toBe(
      "https://squint-dev.vercel.app/",
    );
  });

  it("falls back to localhost outside Vercel", () => {
    expect(siteUrl({}).href).toBe("http://localhost:3000/");
  });
});
