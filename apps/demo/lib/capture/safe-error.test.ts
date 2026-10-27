import { describe, expect, it } from "vitest";
import { safeError } from "./safe-error";

const SECRETS = ["qantoSecret789", "token", "/qa", "8443", "?", "#frag", "s3cr3t"];

function expectClean(line: string) {
  for (const secret of SECRETS) expect(line).not.toContain(secret);
}

describe("safeError", () => {
  it("keeps only the net::ERR code of a Playwright navigation error", () => {
    const error = new Error(
      "page.goto: net::ERR_CONNECTION_REFUSED at https://example.com:8443/qa?token=qantoSecret789#frag\nCall log:\n  - navigating to ...",
    );
    expect(safeError(error)).toBe("net::ERR_CONNECTION_REFUSED");
  });

  it("drops the call log, where Playwright repeats the URL", () => {
    const error = new Error(
      'page.goto: Timeout 25000ms exceeded.\nCall log:\n  - navigating to "https://example.com:8443/qa?token=qantoSecret789"',
    );
    expect(safeError(error)).toBe("page.goto: Timeout 25000ms exceeded.");
  });

  it("cuts everything from ' at ' and removes URLs, queries and secrets", () => {
    const cases = [
      "Navigation failed at https://example.com:8443/qa?token=qantoSecret789",
      "Could not load https://example.com:8443/qa?token=qantoSecret789#frag for capture",
      "Request to /qa?token=qantoSecret789 was refused",
      "Refused with api_key=s3cr3t and password=s3cr3t",
    ];
    for (const message of cases) expectClean(safeError(new Error(message)));
    expect(safeError(new Error("Could not load https://example.com/qa?x=1 now"))).toBe(
      "Could not load <url> now",
    );
  });

  it("handles values that aren't errors", () => {
    expect(safeError("plain failure")).toBe("plain failure");
    expect(safeError(undefined)).toBe("undefined");
    expectClean(safeError({ toString: () => "boom at https://example.com/qa?token=s3cr3t" }));
  });
});
