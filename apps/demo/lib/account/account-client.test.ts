import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountErrorMessage,
  changePassword,
  confirmEmailChange,
  logOutEverywhere,
  requestEmailChange,
  saveDisplayName,
} from "./account-client";

function answer(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body, { status, headers }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("account client", () => {
  it("sends JSON to the session's own routes, never a user id", async () => {
    const fetch = answer(200, { name: "Ana" });
    expect(await saveDisplayName("Ana")).toEqual({ ok: true });
    expect(await logOutEverywhere()).toEqual({ ok: true });
    expect(fetch.mock.calls.map(([path, init]) => [path, init?.method, init?.body])).toEqual([
      ["/api/account/profile", "PATCH", '{"name":"Ana"}'],
      ["/api/account/sessions", "DELETE", "{}"],
    ]);
    for (const [, init] of fetch.mock.calls) {
      expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    }
  });

  it("tells a wrong password, the current address, and the two limits apart", async () => {
    answer(422, { error: "wrong-password" });
    expect(await changePassword("x", "y")).toEqual({ ok: false, error: "wrong-password" });
    answer(422, { error: "same-email" });
    expect(await requestEmailChange("x", "a@b.test")).toEqual({ ok: false, error: "same-email" });
    answer(429, { error: "rate-limited" }, { "retry-after": "120" });
    expect(await changePassword("x", "y")).toEqual({
      ok: false,
      error: "rate-limited",
      retryAfterSeconds: 120,
    });
    answer(429, { error: "too-many-requests" });
    expect(await requestEmailChange("x", "a@b.test")).toEqual({
      ok: false,
      error: "too-many-requests",
    });
    answer(401, { error: "unauthenticated" });
    expect(await saveDisplayName("Ana")).toEqual({ ok: false, error: "signed-out" });
  });

  it("treats a network failure as a failure, not a throw", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    expect(await saveDisplayName("Ana")).toEqual({ ok: false, error: "failed" });
    expect(await confirmEmailChange("t")).toEqual({ ok: false, error: "failed" });
  });

  it("reads the confirm's answers", async () => {
    answer(410);
    expect(await confirmEmailChange("t")).toEqual({ ok: false, error: "expired" });
    answer(409);
    expect(await confirmEmailChange("t")).toEqual({ ok: false, error: "taken" });
    answer(200, { ok: true });
    expect(await confirmEmailChange("t")).toEqual({ ok: true });
  });

  it("words every error without an em dash", () => {
    const errors = [
      "wrong-password",
      "same-email",
      "rate-limited",
      "too-many-requests",
      "invalid",
      "signed-out",
      "failed",
    ] as const;
    for (const error of errors) {
      expect(accountErrorMessage(error, 300)).not.toMatch(/—/);
    }
    expect(accountErrorMessage("rate-limited", 300)).toBe(
      "Too many attempts. Try again in 5 minutes.",
    );
  });
});
