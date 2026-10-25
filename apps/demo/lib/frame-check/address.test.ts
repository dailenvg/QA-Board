import { describe, expect, it } from "vitest";
import { isBlockedAddress } from "./address";

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "::",
    "::1",
    // IPv4-compatible (deprecated) addresses, private or not.
    "::127.0.0.1",
    "::10.0.0.1",
    "::8.8.8.8",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    // Site-local (deprecated).
    "fec0::1",
    "feff:ffff::1",
    "ff02::1",
    "64:ff9b::10.0.0.1",
    "2002:0a00:0001::1",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "93.184.215.14",
    "2606:4700::1111",
    "2001:4860:4860::8888",
    "::ffff:8.8.8.8",
  ])("allows %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});
