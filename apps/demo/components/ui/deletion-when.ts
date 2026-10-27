import { deletionNoticeFrom, isExpired, RETENTION_DAYS } from "@/lib/share/retention";
import { shortTimeLeft, spokenTimeLeft, timeLeft } from "@/lib/share/review-window";

/*
 * Copy for the "deletes on" notice and pill (Writer: the visible strings are
 * here and in DeletionNotice.tsx). `date` is locale-formatted ("Nov 3" or
 * "3 Nov"); `time` likewise ("3:40 PM" or "15:40").
 */
const COPY = {
  headline: {
    on: (date: string) => `Deletes on ${date}`,
    today: (time: string) => `Deletes today at ${time}`,
    tomorrow: (time: string) => `Deletes tomorrow at ${time}`,
    overdue: "Due for deletion",
  },
  pill: {
    on: (date: string) => `Deletes ${date}`,
    today: "Deletes today",
    tomorrow: "Deletes tomorrow",
    overdue: "Due for deletion",
  },
  left: (time: string) => `${time} left`,
} as const;

/** The sentence after the date on tablets and up: why it goes, and what to do about it. */
export const DELETION_EXPLANATION = {
  /** The owner, with comments to export. */
  owner: `Projects are kept for ${RETENTION_DAYS} days. Export the comments to save a copy.`,
  /** The owner, with nothing to export yet. */
  ownerEmpty: `Projects are kept for ${RETENTION_DAYS} days.`,
  /** A client on a shared link. */
  client: `Shared projects are kept for ${RETENTION_DAYS} days. After that, this link stops working.`,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** English like the rest of the copy; the date and time follow the browser's locale. */
const relativeDays = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export interface DeletionWhen {
  /** "Deletes on Nov 3", "Deletes today at 3:40 PM". */
  headline: string;
  /** For a compact pill: "Deletes Nov 3", "Deletes today". */
  short: string;
  /** Shown after the headline: "in 4 days", or in the last 24 hours "5h 12m left". */
  detail: string | null;
  /** `detail` for screen readers: "5 hours and 12 minutes left". */
  spokenDetail: string | null;
  /** Under 24 hours left, or past due: reads as a warning, like the review countdown's last day. */
  urgent: boolean;
  /** Past the date but still on screen (the next load or refresh removes it). */
  overdue: boolean;
  /** Machine-readable deletion time, for `<time dateTime>`. */
  iso: string;
  /** Full date and time, for a tooltip. */
  full: string;
}

/** Midnight that starts `at`'s day in this browser's time zone. */
function startOfDay(at: number): number {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** Calendar days from `now` to `at` here: 0 today, 1 tomorrow (rounded, so DST shifts don't matter). */
function calendarDaysUntil(at: number, now: number): number {
  return Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS);
}

/**
 * What the "deletes on" notice says for something deleted at `expiresAt`, or
 * null outside the notice window (and on the server, where `now` is 0). Once
 * the date has passed it still shows, as overdue, while the project is on
 * screen.
 */
export function deletionWhen(expiresAt: number, now: number): DeletionWhen | null {
  if (!now || !Number.isFinite(expiresAt) || now < deletionNoticeFrom(expiresAt)) return null;
  const at = new Date(expiresAt);
  const sameYear = at.getFullYear() === new Date(now).getFullYear();
  const dateOptions: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (!sameYear) dateOptions.year = "numeric";
  const date = at.toLocaleDateString(undefined, dateOptions);
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const base = {
    iso: at.toISOString(),
    full: at.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" }),
  };

  const left = isExpired(expiresAt, now) ? null : timeLeft(expiresAt, now);
  if (!left) {
    return {
      ...base,
      headline: COPY.headline.overdue,
      short: COPY.pill.overdue,
      detail: null,
      spokenDetail: null,
      urgent: true,
      overdue: true,
    };
  }

  const days = calendarDaysUntil(expiresAt, now);
  const urgent = left.days === 0;
  const headline =
    days <= 0
      ? COPY.headline.today(time)
      : days === 1
        ? COPY.headline.tomorrow(time)
        : COPY.headline.on(date);
  const short = days <= 0 ? COPY.pill.today : days === 1 ? COPY.pill.tomorrow : COPY.pill.on(date);
  // The last 24 hours count down like the review window; before that "in 4 days" (not for tomorrow).
  const detail = urgent
    ? COPY.left(shortTimeLeft(left))
    : days >= 2
      ? relativeDays.format(days, "day")
      : null;
  const spokenDetail = urgent ? COPY.left(spokenTimeLeft(left)) : detail;
  return { ...base, headline, short, detail, spokenDetail, urgent, overdue: false };
}
