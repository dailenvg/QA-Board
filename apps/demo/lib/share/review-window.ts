/**
 * How long clients can add to a share, counted from when its link was created
 * (never from a change to the window). Owner pushes don't extend it. A
 * workspace's link takes any of `REVIEW_WINDOWS`; an anonymous share always
 * has the default. Null hours: no limit, the review never closes.
 */
export const DEFAULT_REVIEW_WINDOW_HOURS = 72;

const HOUR = 60 * 60 * 1000;
const MINUTE = 60_000;

/** The windows an owner can pick, as the API names them, shortest first. */
export const REVIEW_WINDOWS = ["24h", "72h", "7d", "none"] as const;
export type ReviewWindowChoice = (typeof REVIEW_WINDOWS)[number];

const HOURS: Record<ReviewWindowChoice, number | null> = {
  "24h": 24,
  "72h": DEFAULT_REVIEW_WINDOW_HOURS,
  "7d": 168,
  none: null,
};

/** How each choice reads, in the owner's share dialog and the reviewer's guide. */
export const REVIEW_WINDOW_LABELS: Record<ReviewWindowChoice, string> = {
  "24h": "24 hours",
  "72h": "3 days",
  "7d": "7 days",
  none: "No limit",
};

/** The hours a choice stands for (as `squint_shares.review_window_hours` keeps them); null: no limit. */
export function windowHours(choice: ReviewWindowChoice): number | null {
  return HOURS[choice];
}

/** The choice for a share's stored hours; anything else reads as the default. */
export function windowChoice(hours: number | null): ReviewWindowChoice {
  return REVIEW_WINDOWS.find((choice) => HOURS[choice] === hours) ?? "72h";
}

/**
 * When a share created at `createdAt` stops taking client comments and
 * snapshots (epoch ms), with a window of `hours`; null when it never does.
 */
export function reviewDeadline(createdAt: number, hours: number | null): number | null {
  return hours === null ? null : createdAt + hours * HOUR;
}

/** Whether a review ending at `endsAt` (null: never) is over at `now`. */
export function reviewClosed(endsAt: number | null, now: number): boolean {
  return endsAt !== null && now >= endsAt;
}

export interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
}

/**
 * What's left until `endsAt`, in whole days, hours and minutes, rounded up to
 * the minute so it never reads zero while time remains. Null once it's over.
 */
export function timeLeft(endsAt: number, now: number): TimeLeft | null {
  if (now >= endsAt) return null;
  const total = Math.ceil((endsAt - now) / MINUTE);
  return {
    days: Math.floor(total / 1440),
    hours: Math.floor((total % 1440) / 60),
    minutes: total % 60,
  };
}

/** "2d 4h 12m", "4h 12m", "12m": compact, for a chip. */
export function shortTimeLeft({ days, hours, minutes }: TimeLeft): string {
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const unit = (count: number, name: string) => `${count} ${name}${count === 1 ? "" : "s"}`;

/** "2 days, 4 hours and 12 minutes" (zero units left out): for screen readers and sentences. */
export function spokenTimeLeft({ days, hours, minutes }: TimeLeft): string {
  const parts = [
    ...(days ? [unit(days, "day")] : []),
    ...(hours ? [unit(hours, "hour")] : []),
    ...(minutes ? [unit(minutes, "minute")] : []),
  ];
  const last = parts.pop();
  return parts.length ? `${parts.join(", ")} and ${last}` : (last ?? "");
}
