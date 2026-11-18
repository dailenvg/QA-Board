import { describe, expect, it } from "vitest";
import { utcDateTime, utcDay } from "./utc-format";

describe("utc-format", () => {
  it("spells out dates and times in UTC, whatever the local zone", () => {
    const at = Date.UTC(2026, 10, 7, 9, 5, 59);
    expect(utcDay(at)).toBe("Nov 7");
    expect(utcDateTime(at)).toBe("Nov 7, 2026, 09:05 UTC");
    expect(utcDateTime(Date.UTC(2026, 0, 31, 23, 59))).toBe("Jan 31, 2026, 23:59 UTC");
  });
});
