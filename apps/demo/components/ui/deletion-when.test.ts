import { describe, expect, it } from "vitest";
import { DELETION_NOTICE_MS } from "@/lib/share/retention";
import { deletionWhen } from "./deletion-when";

const HOUR = 60 * 60 * 1000;
/** Local time, mid-June: no daylight-saving change nearby in any zone, whatever the runner's. */
const local = (month: number, day: number, hour: number, year = 2026) =>
  new Date(year, month, day, hour).getTime();
const EXPIRES = local(5, 20, 15);
const time = new Date(EXPIRES).toLocaleTimeString(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const date = new Date(EXPIRES).toLocaleDateString(undefined, { month: "short", day: "numeric" });

describe("deletionWhen", () => {
  it("says nothing on the server (no clock) or before the 5-day notice starts", () => {
    expect(deletionWhen(EXPIRES, 0)).toBeNull();
    expect(deletionWhen(EXPIRES, EXPIRES - DELETION_NOTICE_MS - 1)).toBeNull();
    expect(deletionWhen(Number.NaN, EXPIRES)).toBeNull();
  });

  it("gives the date and the days left from the notice's first moment", () => {
    const when = deletionWhen(EXPIRES, EXPIRES - DELETION_NOTICE_MS);
    expect(when).toMatchObject({
      headline: `Deletes on ${date}`,
      short: `Deletes ${date}`,
      detail: "in 5 days",
      spokenDetail: "in 5 days",
      urgent: false,
      overdue: false,
      iso: new Date(EXPIRES).toISOString(),
    });
  });

  it("says tomorrow, with the time, and no redundant 'in 1 day'", () => {
    const when = deletionWhen(EXPIRES, local(5, 19, 10));
    expect(when).toMatchObject({
      headline: `Deletes tomorrow at ${time}`,
      short: "Deletes tomorrow",
      detail: null,
      urgent: false,
    });
  });

  it("counts down the last 24 hours like the review window, as a warning", () => {
    const when = deletionWhen(EXPIRES, EXPIRES - 23 * HOUR);
    expect(when).toMatchObject({
      headline: `Deletes tomorrow at ${time}`,
      detail: "23h 0m left",
      spokenDetail: "23 hours left",
      urgent: true,
    });
    expect(deletionWhen(EXPIRES, local(5, 20, 9))).toMatchObject({
      headline: `Deletes today at ${time}`,
      short: "Deletes today",
      detail: "6h 0m left",
      urgent: true,
    });
  });

  it("reads as overdue from the moment it's due until it's gone", () => {
    expect(deletionWhen(EXPIRES, EXPIRES)).toMatchObject({
      headline: "Due for deletion",
      short: "Due for deletion",
      detail: null,
      urgent: true,
      overdue: true,
    });
  });

  it("adds the year when deletion falls in the next one", () => {
    const newYear = local(0, 2, 12, 2027);
    expect(deletionWhen(newYear, local(11, 30, 12))?.headline).toContain("2027");
    expect(deletionWhen(EXPIRES, local(5, 16, 12))?.headline).not.toContain("2026");
  });
});
