import { describe, expect, it } from "vitest";
import { BYTES_PER_GB, MAX_QUOTA_BYTES, MIN_QUOTA_BYTES, parseQuotaGb, quotaGb } from "./quota";

describe("quota in GB", () => {
  it("reads a GB figure as bytes, the way the Storage page counts a GB", () => {
    expect(parseQuotaGb("5")).toBe(5 * BYTES_PER_GB);
    expect(parseQuotaGb(" 2.5 ")).toBe(2.5 * BYTES_PER_GB);
    expect(parseQuotaGb("0.1")).toBe(MIN_QUOTA_BYTES);
    expect(parseQuotaGb("1024")).toBe(MAX_QUOTA_BYTES);
  });

  it("refuses anything else: empty, negative, out of bounds, over one decimal, words", () => {
    for (const input of ["", "0", "0.05", "-1", "1025", "1.25", "5 GB", "1e3", "abc", ".5"]) {
      expect(parseQuotaGb(input)).toBeNull();
    }
  });

  it("shows bytes as GB to one decimal", () => {
    expect(quotaGb(5 * BYTES_PER_GB)).toBe(5);
    expect(quotaGb(1.26 * BYTES_PER_GB)).toBe(1.3);
  });
});
