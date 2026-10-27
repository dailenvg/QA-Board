import { describe, expect, it } from "vitest";
import {
  DELETION_NOTICE_MS,
  deletionNoticeFrom,
  inDeletionNotice,
  isExpired,
  ORPHAN_BLOB_MS,
  projectCreatedAt,
  RETENTION_MS,
  rescheduledExpiry,
  retentionCutoff,
  retentionDeadline,
  shareExpiresAt,
  withFullNotice,
} from "./retention";

const DAY = 24 * 60 * 60 * 1000;
/** 2026-10-01T00:00:00Z, in epoch ms. */
const CREATED = Date.UTC(2026, 9, 1);
const day = (n: number) => CREATED + n * DAY;

describe("retention", () => {
  it("is 30 days in ms, with the notice 5 days before and orphaned files a day after", () => {
    expect(RETENTION_MS).toBe(2_592_000_000);
    expect(DELETION_NOTICE_MS).toBe(5 * DAY);
    expect(ORPHAN_BLOB_MS).toBe(31 * DAY);
    expect(retentionDeadline(CREATED)).toBe(Date.UTC(2026, 9, 31));
  });

  it("deletes on day 30, on the dot, and not a millisecond before", () => {
    const expiresAt = retentionDeadline(CREATED);
    expect(isExpired(expiresAt, day(30) - 1)).toBe(false);
    expect(isExpired(expiresAt, day(30))).toBe(true);
    // The cron's cutoff agrees: created at or before it means expired.
    expect(retentionCutoff(day(30))).toBe(CREATED);
    expect(retentionCutoff(day(30) - 1)).toBeLessThan(CREATED);
  });

  it("shows the deletion notice from day 25 until deletion", () => {
    const expiresAt = retentionDeadline(CREATED);
    expect(deletionNoticeFrom(expiresAt)).toBe(day(25));
    expect(inDeletionNotice(expiresAt, day(25) - 1)).toBe(false);
    expect(inDeletionNotice(expiresAt, day(25))).toBe(true);
    expect(inDeletionNotice(expiresAt, day(30) - 1)).toBe(true);
    expect(inDeletionNotice(expiresAt, day(30))).toBe(false);
  });

  it("counts from the project's creation when it's usable epoch ms", () => {
    const shared = day(10);
    expect(projectCreatedAt({ createdAt: CREATED }, shared)).toBe(CREATED);
    expect(projectCreatedAt({ createdAt: shared }, shared)).toBe(shared);
  });

  it("falls back to the share's creation for a missing, future or malformed date", () => {
    const shared = day(10);
    expect(projectCreatedAt({}, shared)).toBe(shared);
    expect(projectCreatedAt({ createdAt: shared + 1 }, shared)).toBe(shared);
    expect(projectCreatedAt({ createdAt: CREATED + 0.5 }, shared)).toBe(shared);
    expect(projectCreatedAt({ createdAt: 0 }, shared)).toBe(shared);
  });

  it("never reads epoch seconds as ms (that would date the project to 1970 and delete it)", () => {
    const shared = day(10);
    const seconds = Math.floor(CREATED / 1000);
    expect(projectCreatedAt({ createdAt: seconds }, shared)).toBe(shared);
    expect(
      isExpired(retentionDeadline(projectCreatedAt({ createdAt: seconds }, shared)), shared),
    ).toBe(false);
    // And a cutoff from ms `now` never reaches a share made moments ago.
    expect(retentionCutoff(shared)).toBeLessThan(shared - 29 * DAY);
  });

  it("never deletes before the notice has shown for 5 days", () => {
    expect(withFullNotice(day(30), day(0))).toBe(day(30));
    expect(withFullNotice(day(30), day(25))).toBe(day(30));
    expect(withFullNotice(day(30), day(28))).toBe(day(33));
    // Shares: the notice could first be seen when the link was made.
    expect(shareExpiresAt({ createdAt: CREATED }, day(10))).toBe(day(30));
    expect(shareExpiresAt({ createdAt: CREATED }, day(28))).toBe(day(33));
    expect(shareExpiresAt({}, day(28))).toBe(day(58));
  });

  it("gives 5 days' notice when a push reveals an older project", () => {
    // Shared on day 40 without a project date: day 70. A push on day 60 says the project is from day 0.
    expect(rescheduledExpiry(day(70), { createdAt: CREATED }, day(40), day(60))).toBe(day(65));
    // A date already nearer stays put, however the project changes.
    expect(rescheduledExpiry(day(62), { createdAt: CREATED }, day(40), day(60))).toBe(day(62));
    // Pushed long before the date: the project's own date counts.
    expect(rescheduledExpiry(day(40), { createdAt: day(5) }, day(10), day(11))).toBe(day(35));
    // A push that drops the date counts from the link again.
    expect(rescheduledExpiry(day(35), {}, day(10), day(11))).toBe(day(40));
  });
});
