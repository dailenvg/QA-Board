import { afterEach, describe, expect, it, vi } from "vitest";
import { captureRemote } from "./remote";
import { CAPTURE_HEADERS } from "./types";

function answer(extra: Record<string, string> = {}) {
  return new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
    headers: {
      "content-type": "image/jpeg",
      [CAPTURE_HEADERS.width]: "1024",
      [CAPTURE_HEADERS.height]: "900",
      ...extra,
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("captureRemote", () => {
  it("passes on where the page ended up, when the service says", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(answer({ [CAPTURE_HEADERS.finalUrl]: "https://acme.example/pricing/" })),
      ),
    );
    const image = await captureRemote(
      "https://capture.example/",
      { url: "https://acme.example/pricing", width: 1024 },
      new AbortController().signal,
    );
    expect(image).toMatchObject({ width: 1024, height: 900, scale: 1 });
    expect(image.finalUrl).toBe("https://acme.example/pricing/");
  });

  it("leaves it out when the service doesn't", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(answer())),
    );
    const image = await captureRemote(
      "https://capture.example/",
      { url: "https://acme.example/", width: 1024 },
      new AbortController().signal,
    );
    expect(image).not.toHaveProperty("finalUrl");
  });
});
