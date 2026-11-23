import { afterEach, describe, expect, it, vi } from "vitest";
import { captureRemote } from "./remote";

const INPUT = { url: "https://acme.example/", width: 1440 };

function answer(status: number, body: unknown) {
  vi.stubGlobal("fetch", () => Promise.resolve(Response.json(body, { status })));
}

async function failureOf(): Promise<unknown> {
  return captureRemote("https://capture.example/", INPUT, new AbortController().signal).catch(
    (error: unknown) => error,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a remote capture service's failure", () => {
  it("passes a login page's code on", async () => {
    answer(422, { error: "login-page" });
    expect(await failureOf()).toMatchObject({ code: "login-page" });
  });

  it("is a plain failure when its code is unknown", async () => {
    answer(500, { error: "kaput" });
    expect(await failureOf()).toMatchObject({ code: "failed" });
  });
});

describe("a remote capture service's image", () => {
  function image(headers: Record<string, string>) {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(new Uint8Array([0xff, 0xd8]), {
          headers: {
            "content-type": "image/jpeg",
            "x-capture-width": "1440",
            "x-capture-height": "900",
            ...headers,
          },
        }),
      ),
    );
    return captureRemote("https://capture.example/", INPUT, new AbortController().signal);
  }

  it("passes on that it's partial", async () => {
    expect(await image({ "x-capture-partial": "1" })).toMatchObject({ height: 900, partial: true });
  });

  it("isn't partial without the header", async () => {
    expect(await image({})).not.toHaveProperty("partial");
  });
});
