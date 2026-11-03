import { describe, expect, it } from "vitest";
import { describeError, isCrossSite } from "./http";

function post(headers: Record<string, string>): Request {
  return new Request("https://www.squintreview.com/api/auth/login", { method: "POST", headers });
}

describe("isCrossSite", () => {
  it("passes same-host and origin-less requests", () => {
    expect(isCrossSite(post({ host: "www.squintreview.com" }))).toBe(false);
    expect(
      isCrossSite(post({ host: "www.squintreview.com", origin: "https://www.squintreview.com" })),
    ).toBe(false);
  });

  it("refuses other hosts and malformed origins", () => {
    expect(isCrossSite(post({ host: "www.squintreview.com", origin: "https://evil.test" }))).toBe(
      true,
    );
    expect(isCrossSite(post({ host: "www.squintreview.com", origin: "null" }))).toBe(true);
  });

  it("compares against the forwarded host behind a proxy", () => {
    expect(
      isCrossSite(
        post({
          host: "internal:3000",
          "x-forwarded-host": "www.squintreview.com",
          origin: "https://www.squintreview.com",
        }),
      ),
    ).toBe(false);
  });
});

describe("describeError", () => {
  it("names the error and its code, never its message", () => {
    const error = Object.assign(new Error("Key (email)=(ana@acme.test) exists"), { code: "23505" });
    expect(describeError(error)).toBe("Error 23505");
    expect(describeError("boom")).toBe("string");
  });
});
