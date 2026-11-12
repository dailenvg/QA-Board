import { describe, expect, it } from "vitest";
import { clientAddress, createRateLimiter, rateLimitAddress } from "./rate-limit";

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

describe("rateLimitAddress", () => {
  it("keeps an IPv4 address, and takes an IPv4-mapped IPv6 address as its IPv4", () => {
    expect(rateLimitAddress("1.2.3.4")).toBe("1.2.3.4");
    expect(rateLimitAddress("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(rateLimitAddress("::FFFF:0102:0304")).toBe("1.2.3.4");
    expect(rateLimitAddress("0:0:0:0:0:ffff:1.2.3.4")).toBe("1.2.3.4");
  });

  it("counts every IPv6 address in a /64 as one, and other /64s apart", () => {
    const network = rateLimitAddress("2001:db8:1:2::1");
    expect(network).toBe("2001:db8:1:2::/64");
    for (const address of [
      "2001:db8:1:2:ffff:ffff:ffff:ffff",
      "2001:db8:1:2:abcd::9",
      "[2001:db8:1:2::77]",
      "2001:db8:1:2::1%eth0",
    ]) {
      expect(rateLimitAddress(address)).toBe(network);
    }
    expect(rateLimitAddress("2001:db8:1:3::1")).not.toBe(network);
    expect(rateLimitAddress("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });

  it("reads compressed, expanded and any-case forms of an address alike", () => {
    const network = rateLimitAddress("2001:db8::1");
    for (const address of [
      "2001:0db8:0000:0000:0000:0000:0000:0001",
      "2001:DB8:0:0::1",
      "[2001:Db8::1%en0]",
    ]) {
      expect(rateLimitAddress(address)).toBe(network);
    }
    expect(rateLimitAddress("::1")).toBe("0:0:0:0::/64");
  });

  it("keeps anything it can't read as it is, without throwing", () => {
    for (const garbage of [
      "unknown",
      "",
      "1.2.3.256",
      "2001:db8:::1",
      "1:2:3:4:5:6:7:8:9",
      "zz::1",
    ]) {
      expect(rateLimitAddress(garbage)).toBe(garbage);
    }
  });
});
