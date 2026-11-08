import { afterEach, describe, expect, it, vi } from "vitest";
import { loginErrorMessage, requestLogin, setNewPassword } from "./auth-client";

function answer(status: number, headers: Record<string, string> = {}, body: string | null = null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(body, { status, headers }))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestLogin", () => {
  it("reads each answer of the login route", async () => {
    answer(200, {}, JSON.stringify({ ok: true, welcome: "first" }));
    expect(await requestLogin("a@b.co", "pw")).toEqual({ ok: true, welcome: "first" });
    answer(200, {}, JSON.stringify({ ok: true, welcome: "back" }));
    expect(await requestLogin("a@b.co", "pw")).toEqual({ ok: true, welcome: "back" });
    // An answer that doesn't say greets as a return.
    answer(200);
    expect(await requestLogin("a@b.co", "pw")).toEqual({ ok: true, welcome: "back" });
    answer(401);
    expect(await requestLogin("a@b.co", "pw")).toEqual({
      ok: false,
      error: "invalid-credentials",
    });
    answer(429, { "retry-after": "61" });
    expect(await requestLogin("a@b.co", "pw")).toEqual({
      ok: false,
      error: "rate-limited",
      retryAfterSeconds: 61,
    });
    answer(503);
    expect(await requestLogin("a@b.co", "pw")).toMatchObject({ error: "not-configured" });
    answer(500);
    expect(await requestLogin("a@b.co", "pw")).toMatchObject({ error: "failed" });
  });

  it("treats a network failure as an outcome", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline"))),
    );
    expect(await requestLogin("a@b.co", "pw")).toEqual({ ok: false, error: "failed" });
  });
});

describe("loginErrorMessage", () => {
  it("is generic for credentials and counts whole minutes for the lock", () => {
    expect(loginErrorMessage("invalid-credentials")).toBe(
      "Invalid email or password. Check both and try again, or reset your password.",
    );
    expect(loginErrorMessage("rate-limited", 30)).toBe("Too many attempts. Try again in 1 minute.");
    expect(loginErrorMessage("rate-limited", 61)).toBe(
      "Too many attempts. Try again in 2 minutes.",
    );
  });
});

describe("setNewPassword", () => {
  it("tells an expired link from other failures", async () => {
    answer(410);
    expect(await setNewPassword("t", "p")).toEqual({ ok: false, error: "expired" });
    answer(500);
    expect(await setNewPassword("t", "p")).toEqual({ ok: false, error: "failed" });
    answer(200);
    expect(await setNewPassword("t", "p")).toEqual({ ok: true });
  });
});
