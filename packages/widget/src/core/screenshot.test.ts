import { afterEach, describe, expect, it, vi } from "vitest";
import { captureViewport, estimateDataUrlBytes } from "./screenshot";

vi.mock("html-to-image", () => ({
  toCanvas: vi.fn(() => Promise.reject(new Error("SecurityError: tainted canvas"))),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("estimateDataUrlBytes", () => {
  it("computes decoded size from base64", () => {
    expect(estimateDataUrlBytes(`data:image/png;base64,${btoa("abc")}`)).toBe(3);
    expect(estimateDataUrlBytes(`data:image/png;base64,${btoa("abcd")}`)).toBe(4);
    expect(estimateDataUrlBytes(`data:image/png;base64,${btoa("abcde")}`)).toBe(5);
  });
});

describe("captureViewport", () => {
  it("resolves to null instead of throwing when capture fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const host = document.createElement("div");
    await expect(captureViewport({ exclude: host })).resolves.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});
