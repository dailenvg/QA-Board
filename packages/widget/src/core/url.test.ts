import { describe, expect, it } from "vitest";
import { normalizePagePath } from "./url";

describe("normalizePagePath", () => {
  it("keeps ordinary paths", () => {
    expect(normalizePagePath("/")).toBe("/");
    expect(normalizePagePath("/pricing")).toBe("/pricing");
    expect(normalizePagePath("/a//b")).toBe("/a//b");
  });

  it("collapses repeated leading slashes so the path is never protocol-relative", () => {
    expect(normalizePagePath("//evil.example/x")).toBe("/evil.example/x");
    expect(normalizePagePath("///a")).toBe("/a");
  });

  it("adds a leading slash when missing", () => {
    expect(normalizePagePath("pricing")).toBe("/pricing");
    expect(normalizePagePath("")).toBe("/");
  });

  it("matches what the browser reports for a double-slash URL", () => {
    expect(normalizePagePath(new URL("https://preview.app//pricing").pathname)).toBe("/pricing");
  });
});
