import { describe, expect, it } from "vitest";
import { ageShare, checkedPins, perDay, rowsThatFit, startOfDay } from "./charts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Local noon, so the tests read the same in any time zone. */
const NOON = new Date(2026, 10, 9, 12).getTime();
const TODAY = startOfDay(NOON);

describe("overview charts", () => {
  it("starts a day at local midnight", () => {
    expect(TODAY).toBe(new Date(2026, 10, 9).getTime());
    expect(startOfDay(TODAY)).toBe(TODAY);
  });

  it("counts updates per day over the last week, today last", () => {
    const times = [NOON, NOON - HOUR, TODAY, TODAY - 1, NOON - 3 * DAY, NOON - 6 * DAY];
    expect(perDay(times, TODAY)).toEqual([1, 0, 0, 1, 0, 1, 3]);
    // Older than the week, or later than today, is left out.
    expect(perDay([NOON - 7 * DAY, TODAY + DAY], TODAY)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(perDay([NOON], TODAY, 2)).toEqual([0, 1]);
  });

  it("measures each wait against the longest", () => {
    expect(ageShare(NOON - 2 * DAY, NOON - 2 * DAY, NOON)).toBe(1);
    expect(ageShare(NOON - DAY, NOON - 2 * DAY, NOON)).toBe(0.5);
    expect(ageShare(NOON, NOON - 2 * DAY, NOON)).toBe(0);
    // Nothing has waited yet (or the clock is behind): full bars, never NaN.
    expect(ageShare(NOON, NOON, NOON)).toBe(1);
    expect(ageShare(NOON + HOUR, NOON - DAY, NOON)).toBe(0);
  });

  it("fits as many rows as there's room for, keeping room for the more link", () => {
    const sizes = { row: 56, gap: 4, more: 24 };
    expect(rowsThatFit({ ...sizes, available: 500, total: 3 })).toBe(3);
    // Three rows take 176px: exactly enough, no link needed.
    expect(rowsThatFit({ ...sizes, available: 176, total: 3 })).toBe(3);
    // Five don't fit in 176: two rows (116) plus the link (4 + 24) do.
    expect(rowsThatFit({ ...sizes, available: 176, total: 5 })).toBe(2);
    // Always one row, however tight.
    expect(rowsThatFit({ ...sizes, available: 10, total: 5 })).toBe(1);
    expect(rowsThatFit({ ...sizes, available: 500, total: 0 })).toBe(0);
  });

  it("checks off a row of pins by the resolved share, never all or none too early", () => {
    expect(checkedPins(3, 1, 5)).toBe(1);
    expect(checkedPins(1, 1, 5)).toBe(3);
    expect(checkedPins(1, 199, 5)).toBe(4);
    expect(checkedPins(199, 1, 5)).toBe(1);
    expect(checkedPins(0, 4, 5)).toBe(5);
    expect(checkedPins(4, 0, 5)).toBe(0);
    expect(checkedPins(0, 0, 5)).toBe(0);
  });
});
