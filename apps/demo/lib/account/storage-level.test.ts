import { describe, expect, it } from "vitest";
import { formatBytes, storageLevel, usedPercent } from "./storage-level";

const GB = 1024 ** 3;

describe("storageLevel", () => {
  it("warns from 80% of the quota, and is over once it's used up", () => {
    expect(storageLevel(0, 5 * GB)).toBe("ok");
    expect(storageLevel(4 * GB - 1, 5 * GB)).toBe("ok");
    expect(storageLevel(4 * GB, 5 * GB)).toBe("near");
    expect(storageLevel(5 * GB - 1, 5 * GB)).toBe("near");
    expect(storageLevel(5 * GB, 5 * GB)).toBe("over");
    expect(storageLevel(6 * GB, 5 * GB)).toBe("over");
  });

  it("treats a zero quota as full: nothing more can be stored", () => {
    expect(storageLevel(0, 0)).toBe("over");
  });
});

describe("usedPercent", () => {
  it("rounds down, so it never shows 80% before the warning", () => {
    expect(usedPercent(0, 100)).toBe(0);
    expect(usedPercent(79.9, 100)).toBe(79);
    expect(usedPercent(80, 100)).toBe(80);
    expect(usedPercent(150, 100)).toBe(150);
  });

  it("shows at least 1% once anything is stored", () => {
    expect(usedPercent(1, 5 * GB)).toBe(1);
    expect(usedPercent(1, 0)).toBe(100);
  });
});

describe("formatBytes", () => {
  it("picks the largest unit, with one decimal under 10", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(340 * 1024)).toBe("340 KB");
    expect(formatBytes(1.24 * GB)).toBe("1.2 GB");
    expect(formatBytes(5 * GB)).toBe("5 GB");
    expect(formatBytes(2048 * GB)).toBe("2 TB");
  });

  it("never shows a negative size", () => {
    expect(formatBytes(-5)).toBe("0 B");
  });
});
