import { describe, expect, it } from "vitest";
import { checkImage, imageDimensions } from "./image-check";
import { pngHeader, jpegHeader, webpLossless, webpLossy, webpExtended } from "@/test/image-headers";

describe("imageDimensions", () => {
  it("reads a PNG's size from its IHDR chunk", () => {
    expect(imageDimensions(pngHeader(512, 256), "image/png")).toEqual({ width: 512, height: 256 });
  });

  it("walks a JPEG's segments to its frame, baseline or progressive", () => {
    expect(imageDimensions(jpegHeader(300, 200), "image/jpeg")).toEqual({
      width: 300,
      height: 200,
    });
    expect(imageDimensions(jpegHeader(64, 48, { progressive: true }), "image/jpeg")).toEqual({
      width: 64,
      height: 48,
    });
  });

  it("gives up on a JPEG whose scan starts before any frame, or that's cut short", () => {
    const noFrame = Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0, 0, 0, 0, 0, 0]);
    expect(imageDimensions(noFrame, "image/jpeg")).toBeNull();
    expect(imageDimensions(jpegHeader(300, 200).subarray(0, 24), "image/jpeg")).toBeNull();
  });

  it("reads lossy, lossless and extended WebP", () => {
    expect(imageDimensions(webpLossy(320, 240), "image/webp")).toEqual({ width: 320, height: 240 });
    expect(imageDimensions(webpLossless(511, 17), "image/webp")).toEqual({
      width: 511,
      height: 17,
    });
    expect(imageDimensions(webpExtended(400, 100), "image/webp")).toEqual({
      width: 400,
      height: 100,
    });
  });

  it("gives up on a header that's too short or has a size of zero", () => {
    expect(imageDimensions(pngHeader(10, 10).subarray(0, 20), "image/png")).toBeNull();
    expect(imageDimensions(pngHeader(0, 10), "image/png")).toBeNull();
  });
});

describe("checkImage", () => {
  it("accepts a PNG, JPEG or WebP of an allowed size, and says which by its bytes", () => {
    const png = checkImage("logo", pngHeader(512, 128));
    expect(png).toMatchObject({ ok: true, image: { contentType: "image/png", width: 512 } });
    expect(checkImage("avatar", jpegHeader(512, 512))).toMatchObject({
      ok: true,
      image: { contentType: "image/jpeg", width: 512, height: 512 },
    });
    expect(checkImage("avatar", webpLossy(96, 96))).toMatchObject({
      ok: true,
      image: { contentType: "image/webp" },
    });
  });

  it("refuses anything that isn't a PNG, JPEG or WebP by its first bytes", () => {
    const gif = new TextEncoder().encode("GIF89a\x10\x00\x10\x00");
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    for (const bytes of [gif, svg, html, new Uint8Array()]) {
      expect(checkImage("logo", bytes)).toEqual({ ok: false, reason: "wrong-kind" });
    }
    // A PNG signature with no readable header after it.
    const signatureOnly = pngHeader(64, 64).subarray(0, 12);
    expect(checkImage("logo", signatureOnly)).toEqual({ ok: false, reason: "wrong-kind" });
  });

  it("refuses more than 1 MB before looking any further", () => {
    const big = new Uint8Array(1_000_001);
    big.set(pngHeader(64, 64));
    expect(checkImage("logo", big)).toEqual({ ok: false, reason: "too-large" });
    const fits = new Uint8Array(1_000_000);
    fits.set(pngHeader(64, 64));
    expect(checkImage("logo", fits).ok).toBe(true);
  });

  it("holds each kind to its size: avatars square, logos at most 4:1, edges 16 to 512 px", () => {
    const wrongSize = { ok: false, reason: "wrong-size" };
    expect(checkImage("avatar", pngHeader(512, 511))).toEqual(wrongSize);
    expect(checkImage("avatar", pngHeader(513, 513))).toEqual(wrongSize);
    expect(checkImage("avatar", pngHeader(15, 15))).toEqual(wrongSize);
    expect(checkImage("logo", pngHeader(512, 127))).toEqual(wrongSize);
    expect(checkImage("logo", pngHeader(100, 600))).toEqual(wrongSize);
    expect(checkImage("logo", webpExtended(4000, 1000))).toEqual(wrongSize);
    expect(checkImage("logo", pngHeader(128, 512)).ok).toBe(true);
    expect(checkImage("avatar", pngHeader(16, 16)).ok).toBe(true);
  });
});
