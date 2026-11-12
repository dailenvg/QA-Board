import { afterEach, describe, expect, it, vi } from "vitest";
import { VIEW } from "@/test/share-fixture";
import {
  isPasswordRequired,
  retryAfterSeconds,
  retryMessage,
  secondsUntil,
  UNLOCK_MESSAGES,
  unlockFeedback,
  unlockLink,
  unlockPasswordError,
} from "./unlock";

const TOKEN = "t".repeat(43);
const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);

/** Answers each fetch in turn, and records what was asked. */
function answer(...responses: Array<() => Response>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    return next ? Promise.resolve(next()) : Promise.reject(new TypeError("offline"));
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("Retry-After", () => {
  it("reads the header's seconds first, whatever the body says", () => {
    expect(retryAfterSeconds("120", { retryAfterSeconds: 900 }, NOW)).toBe(120);
  });

  it("reads an HTTP date, counted from now", () => {
    const at = new Date(NOW + 90_000).toUTCString();
    expect(retryAfterSeconds(at, null, NOW)).toBe(90);
  });

  it("falls back to the body, then to the limit's 15 minutes", () => {
    expect(retryAfterSeconds(null, { retryAfterSeconds: 61 }, NOW)).toBe(61);
    expect(retryAfterSeconds("soon", null, NOW)).toBe(900);
    expect(retryAfterSeconds(null, { retryAfterSeconds: "x" }, NOW)).toBe(900);
  });

  it("never waits less than a second", () => {
    expect(retryAfterSeconds("0", null, NOW)).toBe(1);
  });
});

describe("the wait's message", () => {
  it("counts whole minutes, rounded up", () => {
    expect(retryMessage(14 * 60 + 1)).toBe("Too many attempts. Try again in 15 minutes.");
    expect(retryMessage(120)).toBe("Too many attempts. Try again in 2 minutes.");
  });

  it("says one minute for anything under it", () => {
    expect(retryMessage(5)).toBe("Too many attempts. Try again in 1 minute.");
  });

  it("counts down to 0 and stays there", () => {
    expect(secondsUntil(NOW + 1_500, NOW)).toBe(2);
    expect(secondsUntil(NOW - 1, NOW)).toBe(0);
    expect(secondsUntil(null, NOW)).toBe(0);
  });
});

describe("a password-required answer", () => {
  it("is a 401 password-required only", () => {
    expect(isPasswordRequired({ ok: false, status: 401, error: "password-required" })).toBe(true);
    expect(isPasswordRequired({ ok: false, status: 401, error: "wrong-password" })).toBe(false);
    expect(isPasswordRequired({ ok: false, status: 404, error: "password-required" })).toBe(false);
    expect(isPasswordRequired({ ok: true, value: null })).toBe(false);
  });
});

describe("unlocking", () => {
  it("posts the password by fetch, then reads the review with the pass", async () => {
    const calls = answer(
      () => Response.json({ passExpiresAt: NOW + 1_000 }),
      () => Response.json(VIEW),
    );
    expect(await unlockLink(TOKEN, "open sesame")).toEqual({ ok: true, view: VIEW });
    expect(calls.map((call) => call.url)).toEqual([`/api/s/${TOKEN}/unlock`, `/api/s/${TOKEN}`]);
    expect(calls[0]?.init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ password: "open sesame" }));
  });

  it("opens a link that no longer has a password, too", async () => {
    answer(
      () => Response.json({ passExpiresAt: null }),
      () => Response.json(VIEW),
    );
    expect(await unlockLink(TOKEN, "anything")).toEqual({ ok: true, view: VIEW });
  });

  it("tells each refusal apart", async () => {
    answer(
      () => Response.json({ error: "wrong-password" }, { status: 401 }),
      () =>
        Response.json(
          { error: "rate-limited", retryAfterSeconds: 900 },
          { status: 429, headers: { "retry-after": "300" } },
        ),
      () => Response.json({ error: "invalid" }, { status: 400 }),
      () => Response.json({ error: "not-found" }, { status: 404 }),
      () => Response.json({ error: "cross-site" }, { status: 403 }),
      () => Response.json({ error: "storage" }, { status: 500 }),
    );
    const reasons = [];
    for (let i = 0; i < 7; i += 1) reasons.push(await unlockLink(TOKEN, "guess"));
    expect(reasons).toEqual([
      { ok: false, reason: "wrong-password" },
      { ok: false, reason: "rate-limited", retryAfterSeconds: 300 },
      { ok: false, reason: "invalid" },
      { ok: false, reason: "gone" },
      { ok: false, reason: "failed" },
      { ok: false, reason: "failed" },
      // No answer at all.
      { ok: false, reason: "failed" },
    ]);
  });

  it("says so when the pass didn't stick, and when the link went meanwhile", async () => {
    answer(
      () => Response.json({ passExpiresAt: NOW }),
      () => Response.json({ error: "password-required" }, { status: 401 }),
      () => Response.json({ passExpiresAt: NOW }),
      () => Response.json({ error: "not-found" }, { status: 404 }),
    );
    expect(await unlockLink(TOKEN, "right")).toEqual({ ok: false, reason: "no-pass" });
    expect(await unlockLink(TOKEN, "right")).toEqual({ ok: false, reason: "gone" });
  });
});

describe("the password screen's feedback", () => {
  it("clears the field and says so under it for a wrong password", () => {
    expect(unlockFeedback({ ok: false, reason: "wrong-password" }, NOW)).toEqual({
      fieldError: UNLOCK_MESSAGES.wrongPassword,
      formError: null,
      retryAt: null,
      clearField: true,
    });
  });

  it("holds submitting until the wait is over after a 429", () => {
    const feedback = unlockFeedback(
      { ok: false, reason: "rate-limited", retryAfterSeconds: 300 },
      NOW,
    );
    expect(feedback).toMatchObject({ retryAt: NOW + 300_000, clearField: false });
  });

  it("keeps the password for a retry when the server couldn't be reached", () => {
    expect(unlockFeedback({ ok: false, reason: "failed" }, NOW)).toMatchObject({
      formError: UNLOCK_MESSAGES.failed,
      clearField: false,
    });
    expect(unlockFeedback({ ok: false, reason: "no-pass" }, NOW).formError).toBe(
      UNLOCK_MESSAGES.noPass,
    );
  });

  it("checks the field before anything is sent", () => {
    expect(unlockPasswordError("")).toBe("Enter the password.");
    expect(unlockPasswordError("x".repeat(129))).toContain("at most 128");
    expect(unlockPasswordError("x")).toBeNull();
    expect(unlockPasswordError("x".repeat(128))).toBeNull();
  });
});
