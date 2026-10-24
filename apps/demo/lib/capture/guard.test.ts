import { describe, expect, it } from "vitest";
import { guardedLookup, isBlockedError, isBlockedHost } from "./guard";

function resolve(hostname: string): Promise<unknown> {
  return new Promise((done) => {
    guardedLookup(hostname, { all: true }, (error, addresses) => done(error ?? addresses));
  });
}

describe("isBlockedHost", () => {
  it.each([
    "localhost",
    "app.localhost",
    "printer.local",
    "127.0.0.1",
    "10.1.2.3",
    "[::1]",
    "::ffff:127.0.0.1",
    "169.254.169.254",
  ])("refuses %s", (host) => {
    expect(isBlockedHost(host)).toBe(true);
  });

  it.each(["example.com", "93.184.215.14", "[2606:4700::1111]"])("allows %s", (host) => {
    expect(isBlockedHost(host)).toBe(false);
  });
});

describe("guardedLookup", () => {
  it("fails names that resolve to loopback", async () => {
    expect(isBlockedError(await resolve("localhost"))).toBe(true);
  });
});
