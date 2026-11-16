import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJoin } from "./join-client";

const TOKEN = "t".repeat(43);

function answer(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body, { status, headers }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestJoin", () => {
  it("posts the token alone when signed in, with a name and password when new", async () => {
    const fetch = answer(200, { ok: true });
    expect(await requestJoin(TOKEN)).toEqual({ ok: true });
    expect(await requestJoin(TOKEN, { name: "Cleo", password: "a long password" })).toEqual({
      ok: true,
    });
    expect(fetch.mock.calls.map(([path, init]) => [path, init?.method, init?.body])).toEqual([
      ["/api/auth/join", "POST", `{"token":"${TOKEN}"}`],
      ["/api/auth/join", "POST", `{"token":"${TOKEN}","name":"Cleo","password":"a long password"}`],
    ]);
  });

  it("names each refusal the route gives, and nothing else", async () => {
    const refusals = [
      [404, "not-found"],
      [409, "expired"],
      [409, "cancelled"],
      [409, "used"],
      [409, "seats-full"],
      [409, "in-another-workspace"],
      [409, "sign-in-first"],
      [409, "account-closing"],
      [403, "wrong-account"],
      [403, "cannot-join"],
    ] as const;
    for (const [status, error] of refusals) {
      answer(status, { error });
      expect(await requestJoin(TOKEN), error).toEqual({ ok: false, error });
    }
    answer(400, { error: "invalid-body" });
    expect(await requestJoin(TOKEN)).toEqual({ ok: false, error: "invalid" });
    answer(403, { error: "cross-site" });
    expect(await requestJoin(TOKEN)).toEqual({ ok: false, error: "failed" });
    answer(503, { error: "not-configured" });
    expect(await requestJoin(TOKEN)).toEqual({ ok: false, error: "failed" });
    answer(429, { error: "rate-limited" }, { "retry-after": "90" });
    expect(await requestJoin(TOKEN)).toEqual({
      ok: false,
      error: "rate-limited",
      retryAfterSeconds: 90,
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    expect(await requestJoin(TOKEN)).toEqual({ ok: false, error: "offline" });
  });
});
