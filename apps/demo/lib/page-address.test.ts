import { describe, expect, it } from "vitest";
import { originOf, pageKey, pagePath, resolvePageAddress, samePage } from "./page-address";

const SITE = "https://acme.example/";

describe("pageKey", () => {
  it("drops the fragment, which only scrolls within a page", () => {
    expect(pageKey("https://acme.example/pricing#faq")).toBe("https://acme.example/pricing");
  });

  it("keeps the query, which can make another page", () => {
    expect(pageKey("https://acme.example/search?q=shoes")).toBe(
      "https://acme.example/search?q=shoes",
    );
  });

  it("refuses other schemes, credentials and junk", () => {
    expect(pageKey("javascript:alert(1)")).toBeNull();
    expect(pageKey("file:///etc/passwd")).toBeNull();
    expect(pageKey("https://user:pass@acme.example/")).toBeNull();
    expect(pageKey("not a url")).toBeNull();
    expect(pageKey(`https://acme.example/${"a".repeat(2048)}`)).toBeNull();
  });
});

describe("samePage", () => {
  it("accepts pages on the project's origin only", () => {
    expect(samePage("https://acme.example/pricing", SITE)).toBe("https://acme.example/pricing");
    expect(samePage("http://acme.example/pricing", SITE)).toBeNull();
    expect(samePage("https://www.acme.example/pricing", SITE)).toBeNull();
    expect(samePage("https://acme.example:8443/pricing", SITE)).toBeNull();
    expect(samePage("https://evil.example/", SITE)).toBeNull();
  });

  it("reads the origin of the project's address, whatever its path", () => {
    expect(originOf("https://acme.example/app/start?x=1")).toBe("https://acme.example");
    expect(samePage("https://acme.example/other", "https://acme.example/app/")).toBe(
      "https://acme.example/other",
    );
  });
});

describe("pagePath", () => {
  it("is the path and query, relative to the site", () => {
    expect(pagePath("https://acme.example/")).toBe("/");
    expect(pagePath("https://acme.example/search?q=a")).toBe("/search?q=a");
  });
});

describe("resolvePageAddress", () => {
  it("takes paths, with or without the leading slash", () => {
    expect(resolvePageAddress("/pricing", SITE)).toEqual({
      ok: true,
      url: "https://acme.example/pricing",
    });
    expect(resolvePageAddress("  pricing?plan=pro ", SITE)).toEqual({
      ok: true,
      url: "https://acme.example/pricing?plan=pro",
    });
    expect(resolvePageAddress("/", "https://acme.example/app/")).toEqual({
      ok: true,
      url: "https://acme.example/",
    });
  });

  it("takes full addresses on the same site, with or without the scheme", () => {
    expect(resolvePageAddress("https://acme.example/about#team", SITE)).toEqual({
      ok: true,
      url: "https://acme.example/about",
    });
    expect(resolvePageAddress("acme.example/about", SITE)).toEqual({
      ok: true,
      url: "https://acme.example/about",
    });
    expect(resolvePageAddress("localhost:3000/a", "http://localhost:3000/")).toEqual({
      ok: true,
      url: "http://localhost:3000/a",
    });
  });

  it("refuses other sites with a message that names this one", () => {
    const other = resolvePageAddress("https://evil.example/", SITE);
    expect(other).toEqual({
      ok: false,
      error:
        "Only pages on acme.example can be reviewed in this project. For a path, start it with /.",
    });
    expect(resolvePageAddress("evil.example/x", SITE).ok).toBe(false);
    expect(resolvePageAddress("//evil.example/x", SITE).ok).toBe(false);
    expect(resolvePageAddress("http://acme.example/", SITE).ok).toBe(false);
  });

  it("refuses other schemes, credentials and empty input", () => {
    expect(resolvePageAddress("javascript:alert(1)", SITE)).toEqual({
      ok: false,
      error: "Only http and https pages can be reviewed.",
    });
    expect(resolvePageAddress("https://a:b@acme.example/", SITE)).toEqual({
      ok: false,
      error: "Page addresses can't include a user name or password.",
    });
    expect(resolvePageAddress("   ", SITE)).toEqual({
      ok: false,
      error: "Enter a page address, such as /pricing.",
    });
    expect(resolvePageAddress(`/${"a".repeat(2050)}`, SITE)).toEqual({
      ok: false,
      error: "That address is too long.",
    });
  });
});
