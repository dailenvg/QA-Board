import { describe, expect, it } from "vitest";
import { readToken, tokensMatch } from "./auth";

describe("readToken", () => {
  it("reads the x-pinpoint-token header", () => {
    expect(readToken(new Headers({ "x-pinpoint-token": " abc " }))).toBe("abc");
  });

  it("reads a Bearer authorization header", () => {
    expect(readToken(new Headers({ authorization: "Bearer xyz" }))).toBe("xyz");
    expect(readToken(new Headers({ authorization: "bearer   xyz" }))).toBe("xyz");
  });

  it("prefers the pinpoint header over authorization", () => {
    const headers = new Headers({ "x-pinpoint-token": "a", authorization: "Bearer b" });
    expect(readToken(headers)).toBe("a");
  });

  it("returns null when absent, blank, or not a bearer token", () => {
    expect(readToken(new Headers())).toBeNull();
    expect(readToken(new Headers({ "x-pinpoint-token": "   " }))).toBeNull();
    expect(readToken(new Headers({ authorization: "Basic dXNlcjpwYXNz" }))).toBeNull();
    expect(readToken(new Headers({ authorization: "Bearer " }))).toBeNull();
  });
});

describe("tokensMatch", () => {
  it("accepts the exact token", async () => {
    await expect(tokensMatch("s3cret-token", "s3cret-token")).resolves.toBe(true);
  });

  it("rejects different tokens, including prefixes and different lengths", async () => {
    await expect(tokensMatch("s3cret", "s3cret-token")).resolves.toBe(false);
    await expect(tokensMatch("s3cret-token-x", "s3cret-token")).resolves.toBe(false);
    await expect(tokensMatch("S3CRET-TOKEN", "s3cret-token")).resolves.toBe(false);
    await expect(tokensMatch("", "s3cret-token")).resolves.toBe(false);
  });
});
