import { describe, expect, it } from "vitest";
import { imageSizeError, isImageType } from "./image-rules";

describe("imageSizeError", () => {
  it("says what's wrong with a size, or nothing", () => {
    expect(imageSizeError("logo", 512, 128)).toBeNull();
    expect(imageSizeError("avatar", 10, 10)).toMatch(/too small/);
    expect(imageSizeError("logo", 600, 200)).toMatch(/512 × 512/);
    expect(imageSizeError("avatar", 200, 100)).toMatch(/square/);
    expect(imageSizeError("logo", 500, 100)).toMatch(/4 times/);
  });
});

describe("isImageType", () => {
  it("takes PNG, JPEG and WebP only", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"])
      expect(isImageType(type)).toBe(true);
    for (const type of ["image/gif", "image/svg+xml", "text/html", ""]) {
      expect(isImageType(type)).toBe(false);
    }
  });
});
