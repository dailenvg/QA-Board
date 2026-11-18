import { afterEach, describe, expect, it, vi } from "vitest";
import { loginErrorMessage, requestLogin, RESET_LINK, setNewPassword } from "./auth-client";

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
    answer(200, {}, JSON.stringify({ ok: true, welcome: "first", home: "/" }));
    expect(await requestLogin("a@b.co", "pw")).toEqual({ ok: true, welcome: "first", home: "/" });
    answer(200, {}, JSON.stringify({ ok: true, welcome: "back", home: "/admin" }));
    expect(await requestLogin("a@b.co", "pw")).toEqual({
      ok: true,
      welcome: "back",
      home: "/admin",
    });
    // An answer that doesn't say greets as a return, at the Overview.
    answer(200);
    expect(await requestLogin("a@b.co", "pw")).toEqual({ ok: true, welcome: "back", home: "/" });
    // A home off this site is no home.
    answer(200, {}, JSON.stringify({ ok: true, welcome: "back", home: "https://evil.test/" }));
    expect(await requestLogin("a@b.co", "pw")).toEqual({ ok: true, welcome: "back", home: "/" });
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
    answer(403, {}, JSON.stringify({ error: "removed" }));
    expect(await requestLogin("a@b.co", "pw")).toEqual({ ok: false, error: "removed" });
    // Any other refusal (another site's Origin) is no answer about the account.
    answer(403, {}, JSON.stringify({ error: "cross-site" }));
    expect(await requestLogin("a@b.co", "pw")).toEqual({ ok: false, error: "failed" });
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

describe("loginErrorMessage for a removed account", () => {
  it("names no workspace or date, and never offers a reset, which would send nothing", () => {
    const message = loginErrorMessage("removed");
    expect(message).toBe(
      "You're no longer in a Squint workspace, so you can't sign in. Ask the person who invited you for a new invite.",
    );
    expect(message).not.toContain(RESET_LINK.text);
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
