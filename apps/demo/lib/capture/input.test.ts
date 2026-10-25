import { describe, expect, it } from "vitest";
import { parseCaptureInput } from "./input";

describe("parseCaptureInput", () => {
  it("accepts an http(s) URL and clamps the width", () => {
    expect(parseCaptureInput({ url: "https://example.com", width: 99999 })).toMatchObject({
      ok: true,
      width: 2560,
    });
    expect(parseCaptureInput({ url: "http://example.com/a", width: 10 })).toMatchObject({
      ok: true,
      width: 320,
    });
    const result = parseCaptureInput({ url: "https://example.com", width: 1023.6 });
    expect(result.ok && result.url.href).toBe("https://example.com/");
    expect(result.ok && result.width).toBe(1024);
  });

  it.each([
    null,
    "https://example.com",
    { url: "file:///etc/passwd", width: 1000 },
    { url: "javascript:alert(1)", width: 1000 },
    { url: "https://user:pass@example.com", width: 1000 },
    { url: "not a url", width: 1000 },
    { url: "https://example.com", width: "1000" },
    { url: "https://example.com", width: Number.NaN },
    { url: `https://example.com/${"a".repeat(2100)}`, width: 1000 },
  ])("rejects %j", (body) => {
    expect(parseCaptureInput(body)).toEqual({ ok: false });
  });
});
