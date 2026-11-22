import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCapture } from "./request-capture";

function answer(status: number, body: unknown) {
  vi.stubGlobal("fetch", () => Promise.resolve(Response.json(body, { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("asking for a capture", () => {
  it("reports a login page as such", async () => {
    answer(422, { error: "login-page" });
    const result = await requestCapture(
      "https://acme.example/",
      1440,
      new AbortController().signal,
    );
    expect(result).toEqual({ ok: false, failure: "login-page" });
  });

  it("reports an unknown code as a plain failure", async () => {
    answer(500, { error: "kaput" });
    const result = await requestCapture(
      "https://acme.example/",
      1440,
      new AbortController().signal,
    );
    expect(result).toEqual({ ok: false, failure: "failed" });
  });

  function image(headers: Record<string, string>) {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(new Blob([new Uint8Array([0xff, 0xd8])], { type: "image/jpeg" }), {
          headers: {
            "content-type": "image/jpeg",
            "x-capture-width": "1440",
            "x-capture-height": "900",
            ...headers,
          },
        }),
      ),
    );
    return requestCapture("https://acme.example/", 1440, new AbortController().signal);
  }

  it("reads a partial capture from its header", async () => {
    expect(await image({ "x-capture-partial": "1" })).toMatchObject({
      ok: true,
      height: 900,
      partial: true,
    });
  });

  it("reads a whole capture as not partial", async () => {
    expect(await image({})).not.toHaveProperty("partial");
  });
});
