import { describe, expect, it } from "vitest";
import { imageCrop, imageSizeError, isImageType } from "./image-rules";

describe("imageCrop", () => {
  it("crops an avatar to its centered square, scaled down to 512 px", () => {
    expect(imageCrop("avatar", 1600, 1200)).toEqual({
      sx: 200,
      sy: 0,
      sw: 1200,
      sh: 1200,
      dw: 512,
      dh: 512,
    });
    expect(imageCrop("avatar", 300, 401)).toEqual({
      sx: 0,
      sy: 50,
      sw: 300,
      sh: 300,
      dw: 300,
      dh: 300,
    });
  });

  it("keeps a logo whole, fitting its longer edge in 512 px and never scaling up", () => {
    expect(imageCrop("logo", 2000, 500)).toEqual({
      sx: 0,
      sy: 0,
      sw: 2000,
      sh: 500,
      dw: 512,
      dh: 128,
    });
    expect(imageCrop("logo", 120, 40)).toEqual({ sx: 0, sy: 0, sw: 120, sh: 40, dw: 120, dh: 40 });
  });

  it("always gives a size that passes the size rules for a reasonable source", () => {
    for (const [width, height] of [
      [4032, 3024],
      [640, 640],
      [17, 900],
    ] as const) {
      const avatar = imageCrop("avatar", width, height);
      expect(imageSizeError("avatar", avatar.dw, avatar.dh), `${width}x${height}`).toBeNull();
    }
  });
});

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
