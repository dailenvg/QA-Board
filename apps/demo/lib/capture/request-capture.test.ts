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
});
