import { describe, expect, it } from "vitest";
import {
  clientInfoSchema,
  parseClientInfo,
  sentClientInfoSchema,
  sentPart,
  USER_AGENT_MAX,
  userAgentOf,
} from "./schema";

const SENT = { viewport: { width: 1440, height: 900 }, dpr: 2, platform: { name: "macOS" } };

describe("sentClientInfoSchema", () => {
  it("takes the window, pixel ratio and platform, any of them missing", () => {
    expect(sentClientInfoSchema.parse(SENT)).toEqual(SENT);
    expect(sentClientInfoSchema.parse({})).toEqual({});
  });

  it("keeps the pixel ratio to two decimals", () => {
    expect(sentClientInfoSchema.parse({ dpr: 1.3333333 }).dpr).toBe(1.33);
  });

  it("drops a user agent: the server takes it from the request", () => {
    expect(sentClientInfoSchema.parse({ ...SENT, userAgent: "made up" })).not.toHaveProperty(
      "userAgent",
    );
  });

  it.each([
    ["a window wider than 10000 px", { viewport: { width: 10_001, height: 900 } }],
    ["an empty window", { viewport: { width: 0, height: 900 } }],
    ["a fractional window", { viewport: { width: 1440.5, height: 900 } }],
    ["a ratio under 0.5", { dpr: 0.4 }],
    ["a ratio over 8", { dpr: 8.5 }],
    ["a long platform name", { platform: { name: "x".repeat(41) } }],
    ["a long platform version", { platform: { name: "macOS", version: "1".repeat(41) } }],
  ])("refuses %s", (_case, value) => {
    expect(sentClientInfoSchema.safeParse(value).success).toBe(false);
  });
});

describe("clientInfoSchema", () => {
  it("needs a user agent no longer than the limit", () => {
    expect(clientInfoSchema.safeParse(SENT).success).toBe(false);
    expect(clientInfoSchema.safeParse({ userAgent: "x".repeat(USER_AGENT_MAX) }).success).toBe(
      true,
    );
    expect(clientInfoSchema.safeParse({ userAgent: "x".repeat(USER_AGENT_MAX + 1) }).success).toBe(
      false,
    );
  });

  it("reads a stored value, or null for anything else", () => {
    expect(parseClientInfo({ userAgent: "UA", ...SENT })).toEqual({ userAgent: "UA", ...SENT });
    expect(parseClientInfo(null)).toBeNull();
    expect(parseClientInfo({ viewport: "big" })).toBeNull();
  });
});

describe("userAgentOf", () => {
  it("cuts the header to the limit, and is empty without one", () => {
    const long = new Request("https://squint.test/", {
      headers: { "user-agent": "y".repeat(USER_AGENT_MAX + 50) },
    });
    expect(userAgentOf(long)).toHaveLength(USER_AGENT_MAX);
    expect(userAgentOf(new Request("https://squint.test/"))).toBe("");
  });
});

describe("sentPart", () => {
  it("leaves the user agent to the server", () => {
    expect(sentPart({ userAgent: "UA", dpr: 2 })).toEqual({ dpr: 2 });
  });
});
