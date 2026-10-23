import { describe, expect, it } from "vitest";
import { PNG_BYTES, PNG_DATA_URL } from "../../test/fixtures";
import { parseScreenshot } from "./screenshot";

function dataUrl(type: string, bytes: Uint8Array): string {
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

describe("parseScreenshot", () => {
  it("accepts a PNG data URL", () => {
    const result = parseScreenshot(PNG_DATA_URL);
    expect(result).toEqual({ ok: true, screenshot: { contentType: "image/png", data: PNG_BYTES } });
  });

  it("accepts a JPEG data URL", () => {
    const result = parseScreenshot(dataUrl("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0])));
    expect(result.ok).toBe(true);
  });

  it.each([
    ["a non-image type", dataUrl("text/html", PNG_BYTES)],
    ["svg", dataUrl("image/svg+xml", PNG_BYTES)],
    ["two images", `${PNG_DATA_URL},${PNG_DATA_URL.split(",")[1]}`],
    ["bad base64", "data:image/png;base64,***"],
    ["a remote URL", "https://example.com/a.png"],
    ["a mismatched signature", dataUrl("image/png", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))],
  ])("rejects %s with 400", (_label, value) => {
    expect(parseScreenshot(value)).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects images over the decoded size cap with 413", () => {
    const big = new Uint8Array(1024);
    big.set(PNG_BYTES);
    expect(parseScreenshot(dataUrl("image/png", big), 1023)).toMatchObject({
      ok: false,
      status: 413,
    });
    expect(parseScreenshot(dataUrl("image/png", big), 1024).ok).toBe(true);
  });
});
