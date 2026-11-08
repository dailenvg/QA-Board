import { describe, expect, it } from "vitest";
import { loginHref, safeNextPath, withWelcome } from "./next-path";

describe("safeNextPath", () => {
  it("keeps paths on this site, with their query", () => {
    expect(safeNextPath("/f/abc")).toBe("/f/abc");
    expect(safeNextPath("/p/1?page=2#c-3")).toBe("/p/1?page=2#c-3");
  });

  it.each([
    null,
    undefined,
    "",
    "f/abc",
    "//evil.test/x",
    "/\\evil.test",
    "https://evil.test/",
    "javascript:alert(1)",
    "/login",
    "/login?next=/f",
    "/api/capture",
  ])("falls back to the Overview for %s", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });
});

describe("loginHref and withWelcome", () => {
  it("only carries somewhere worth returning to", () => {
    expect(loginHref("/")).toBe("/login");
    expect(loginHref("//evil.test")).toBe("/login");
    expect(loginHref("/p/1?page=2")).toBe("/login?next=%2Fp%2F1%3Fpage%3D2");
  });

  it("adds the welcome flag, keeping the query", () => {
    expect(withWelcome("/", "first")).toBe("/?welcome=first");
    expect(withWelcome("/p/1?page=2", "back")).toBe("/p/1?page=2&welcome=back");
  });
});
