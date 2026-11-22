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
