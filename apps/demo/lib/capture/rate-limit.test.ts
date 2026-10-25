import { describe, expect, it } from "vitest";
import { clientAddress, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows `limit` calls per window and per key, then says when to retry", () => {
    const check = createRateLimiter({ limit: 2, windowMs: 60_000 });
    expect(check("a", 0)).toEqual({ ok: true });
    expect(check("a", 1_000)).toEqual({ ok: true });
    expect(check("a", 2_000)).toEqual({ ok: false, retryAfterSeconds: 58 });
    expect(check("b", 2_000)).toEqual({ ok: true });
    expect(check("a", 60_000)).toEqual({ ok: true });
  });
});

describe("clientAddress", () => {
  it("uses the first forwarded address, then x-real-ip", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe(
      "203.0.113.9",
    );
    expect(clientAddress(new Headers({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});
