import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit within the window, then reports Retry-After", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });

    expect(limiter.hit("1.1.1.1").allowed).toBe(true);
    now = 10_000;
    expect(limiter.hit("1.1.1.1").allowed).toBe(true);
    expect(limiter.hit("1.1.1.1").allowed).toBe(true);
    expect(limiter.hit("1.1.1.1")).toEqual({ allowed: false, retryAfterSeconds: 50 });
  });

  it("slides: old hits expire individually", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
    limiter.hit("ip");
    now = 500;
    limiter.hit("ip");
    now = 999;
    expect(limiter.hit("ip").allowed).toBe(false);
    now = 1001;
    expect(limiter.hit("ip").allowed).toBe(true);
    expect(limiter.hit("ip").allowed).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({ limit: 1, now: () => 0 });
    expect(limiter.hit("a").allowed).toBe(true);
    expect(limiter.hit("b").allowed).toBe(true);
    expect(limiter.hit("a").allowed).toBe(false);
  });
});
