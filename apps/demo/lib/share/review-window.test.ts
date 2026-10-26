import { describe, expect, it } from "vitest";
import {
  REVIEW_WINDOW_MS,
  reviewClosed,
  reviewDeadline,
  shortTimeLeft,
  spokenTimeLeft,
  timeLeft,
} from "./review-window";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

describe("review window", () => {
  it("closes 72 hours after the link was created, on the dot", () => {
    expect(REVIEW_WINDOW_MS).toBe(72 * HOUR);
    expect(reviewDeadline(1_000)).toBe(1_000 + 72 * HOUR);
    expect(reviewClosed(1_000, 1_000 + 72 * HOUR - 1)).toBe(false);
    expect(reviewClosed(1_000, 1_000 + 72 * HOUR)).toBe(true);
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
