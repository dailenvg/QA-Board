import { describe, expect, it } from "vitest";
import { buildDeepLink } from "./deeplink";

const ORIGIN = "https://feature-x.preview.app";
const PAGE = "https://feature-x.preview.app/pricing?plan=pro";

function hostOf(link: string): string {
  return new URL(link).origin;
}

describe("buildDeepLink", () => {
  it("uses the server origin, keeps query and hash, drops the token", () => {
    expect(
      buildDeepLink(
        ORIGIN,
        "/pricing",
        "https://evil.example/elsewhere?plan=pro&review=secret&pin=old#faq",
        "p1",
      ),
    ).toBe("https://feature-x.preview.app/pricing?plan=pro&pin=p1#faq");
  });

  it("keeps a normal path on the server origin", () => {
    const link = buildDeepLink(ORIGIN, "/pricing", PAGE, "p1");
    expect(hostOf(link)).toBe(ORIGIN);
    expect(new URL(link).pathname).toBe("/pricing");
  });

  it.each(["//evil.example/x", "/\\evil.example/x", "/%2F%2Fevil.example", "///evil.example"])(
    "never lets the path %s change the host",
    (path) => {
      const link = buildDeepLink(ORIGIN, path, PAGE, "p1");
      expect(hostOf(link)).toBe(ORIGIN);
      expect(link.startsWith(`${ORIGIN}/`)).toBe(true);
      expect(new URL(link).searchParams.get("pin")).toBe("p1");
    },
  );

  it.each(["/..//evil.example", "/./..//evil.example", "/a/../..//evil.example"])(
    "collapses dot segments in %s so the pathname never starts with //",
    (path) => {
      const link = new URL(buildDeepLink(ORIGIN, path, PAGE, "p1"));
      expect(link.origin).toBe(ORIGIN);
      expect(link.pathname.startsWith("//")).toBe(false);
      expect(link.pathname).toBe("/evil.example");
    },
  );

  it("ignores any query or hash embedded in the path", () => {
    const link = buildDeepLink(ORIGIN, "/pricing?pin=forged#x", PAGE, "p1");
    expect(link).toBe("https://feature-x.preview.app/pricing?plan=pro&pin=p1");
  });

  it("replaces any path on the configured origin", () => {
    expect(hostOf(buildDeepLink(`${ORIGIN}/base/`, "//evil.example", PAGE, "p1"))).toBe(ORIGIN);
  });
});
