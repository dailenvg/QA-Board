import { describe, expect, it } from "vitest";
import { reviewWindowSummary } from "./review-window-summary";

const HOUR = 3_600_000;
const NOW = new Date(2026, 10, 12, 9, 0).getTime();

describe("a review window's summary", () => {
  it("says when it closes, in local time, and how long is left", () => {
    expect(reviewWindowSummary(NOW + 54 * HOUR + 30 * 60_000, NOW)).toBe(
      "Open until Sat, Nov 14 · 3:30 PM. Clients can comment for 2 days, 6 hours and 30 minutes more.",
    );
  });

  it("counts the minutes left to the minute shown, so the time and the minutes left agree", () => {
    const end = NOW + 6 * HOUR + 30 * 60_000 + 45_000;
    expect(reviewWindowSummary(end, NOW + 10_000)).toBe(
      "Open until Thu, Nov 12 · 3:30 PM. Clients can comment for 6 hours and 30 minutes more.",
    );
  });

  it("says there's no limit, or how to reopen a closed one", () => {
    expect(reviewWindowSummary(null, NOW)).toMatch(/^No time limit\./);
    expect(reviewWindowSummary(NOW - 1, NOW)).toMatch(/^Review window closed\..*No limit\.$/);
  });
});
