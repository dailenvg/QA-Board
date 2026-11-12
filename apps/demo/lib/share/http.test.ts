import { describe, expect, it } from "vitest";
import { imageResponse, parseRange, rateLimit } from "./http";
import { SHARE_LIMITS } from "./limits";

describe("parseRange", () => {
  it("reads single plain byte ranges", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 });
    for (const header of [
      null,
      "bytes=100-",
      "bytes=9-1",
      "bytes=0-1,4-5",
      "items=0-1",
      "bytes=-5",
    ]) {
      expect(parseRange(header, 100)).toBeNull();
    }
  });
});

describe("imageResponse", () => {
  const bytes = new Uint8Array(SHARE_LIMITS.transferBytes + 10).map((_, index) => index % 251);

  it("never answers a range with more than one transfer's worth", async () => {
    const response = imageResponse(bytes, "image/png", "bytes=0-");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(
      `bytes 0-${SHARE_LIMITS.transferBytes - 1}/${bytes.length}`,
    );
    expect((await response.arrayBuffer()).byteLength).toBe(SHARE_LIMITS.transferBytes);
  });

  it("refuses ranges outside the image", () => {
    expect(imageResponse(bytes, "image/png", "bytes=999999999-").status).toBe(416);
  });
});

describe("rateLimit", () => {
  const from = (address: string) =>
    new Request("http://localhost/api/s/t/unlock", { headers: { "x-forwarded-for": address } });

  it("counts unlocks from one IPv6 /64 together, and other limits per address", () => {
    for (let host = 1; host <= 30; host += 1) {
      expect(rateLimit(from(`2001:db8:9:9::${host.toString(16)}`), "clientUnlock")).toBeNull();
    }
    expect(rateLimit(from("2001:db8:9:9::ffff"), "clientUnlock")?.status).toBe(429);
    expect(rateLimit(from("2001:db8:9:a::1"), "clientUnlock")).toBeNull();
    expect(rateLimit(from("2001:db8:9:9::ffff"), "clientRead")).toBeNull();
  });
});
