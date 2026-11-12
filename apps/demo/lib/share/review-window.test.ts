import { describe, expect, it } from "vitest";
import {
  DEFAULT_REVIEW_WINDOW_HOURS,
  REVIEW_WINDOWS,
  reviewClosed,
  reviewDeadline,
  shortTimeLeft,
  spokenTimeLeft,
  timeLeft,
  windowChoice,
  windowHours,
} from "./review-window";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

describe("review window", () => {
  it.each([24, 72, 168])("closes %i hours after the link was created, on the dot", (hours) => {
    const endsAt = reviewDeadline(1_000, hours);
    expect(endsAt).toBe(1_000 + hours * HOUR);
    expect(reviewClosed(endsAt, 1_000 + hours * HOUR - 1)).toBe(false);
    expect(reviewClosed(endsAt, 1_000 + hours * HOUR)).toBe(true);
  });

  it("never closes without a limit", () => {
    expect(reviewDeadline(1_000, null)).toBeNull();
    expect(reviewClosed(null, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it("names each window as the API does, and reads unknown hours as the 72-hour default", () => {
    expect(DEFAULT_REVIEW_WINDOW_HOURS).toBe(72);
    expect(REVIEW_WINDOWS.map(windowHours)).toEqual([24, 72, 168, null]);
    expect([24, 72, 168, null].map(windowChoice)).toEqual(["24h", "72h", "7d", "none"]);
    expect(windowChoice(48)).toBe("72h");
  });

  it("counts down in days, hours and minutes, rounding up to the minute", () => {
    expect(timeLeft(72 * HOUR, 0)).toEqual({ days: 3, hours: 0, minutes: 0 });
    expect(timeLeft(52 * HOUR + 12 * MINUTE, 0)).toEqual({ days: 2, hours: 4, minutes: 12 });
    expect(timeLeft(30_000, 0)).toEqual({ days: 0, hours: 0, minutes: 1 });
    expect(timeLeft(1_000, 1_000)).toBeNull();
  });

  it("reads compactly on the chip and in full for screen readers", () => {
    const left = { days: 2, hours: 4, minutes: 12 };
    expect(shortTimeLeft(left)).toBe("2d 4h 12m");
    expect(spokenTimeLeft(left)).toBe("2 days, 4 hours and 12 minutes");
    expect(shortTimeLeft({ days: 0, hours: 1, minutes: 0 })).toBe("1h 0m");
    expect(spokenTimeLeft({ days: 0, hours: 1, minutes: 0 })).toBe("1 hour");
    expect(spokenTimeLeft({ days: 3, hours: 0, minutes: 5 })).toBe("3 days and 5 minutes");
    expect(shortTimeLeft({ days: 0, hours: 0, minutes: 1 })).toBe("1m");
    expect(spokenTimeLeft({ days: 0, hours: 0, minutes: 1 })).toBe("1 minute");
  });
});
