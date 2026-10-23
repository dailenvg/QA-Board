import { describe, expect, it } from "vitest";
import { buildDeepLink, cleanPageUrl, readPinParam } from "./deeplink";

describe("readPinParam", () => {
  it("returns the pin id", () => {
    expect(readPinParam("?pin=abc-123")).toBe("abc-123");
    expect(readPinParam("?a=1&pin=xyz")).toBe("xyz");
  });

  it("decodes encoded ids", () => {
    expect(readPinParam("?pin=a%20b")).toBe("a b");
  });

  it("returns null when missing or blank", () => {
    expect(readPinParam("")).toBeNull();
    expect(readPinParam("?pin=")).toBeNull();
    expect(readPinParam("?pin=%20%20")).toBeNull();
    expect(readPinParam("?other=1")).toBeNull();
  });
});

describe("cleanPageUrl", () => {
  it("removes review and pin params but keeps the rest", () => {
    expect(cleanPageUrl("https://x.vercel.app/a?review=t&pin=p&q=1#h")).toBe(
      "https://x.vercel.app/a?q=1#h",
    );
  });
});

describe("buildDeepLink", () => {
  it("appends ?pin= and never leaks the review token", () => {
    const link = buildDeepLink("https://x.vercel.app/pricing?review=secret&plan=pro", "p1");
    expect(link).toBe("https://x.vercel.app/pricing?plan=pro&pin=p1");
    expect(link).not.toContain("secret");
  });

  it("replaces an existing pin param", () => {
    expect(buildDeepLink("https://x.vercel.app/?pin=old", "new")).toBe(
      "https://x.vercel.app/?pin=new",
    );
  });

  it("round-trips with readPinParam", () => {
    const link = new URL(buildDeepLink("https://x.vercel.app/", "id with space"));
    expect(readPinParam(link.search)).toBe("id with space");
  });
});
