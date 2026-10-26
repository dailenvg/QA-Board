/**
 * How long clients can add to a share, counted from when its link was created.
 * Owner pushes don't extend it; revoking and sharing again starts a new one.
 */
export const REVIEW_WINDOW_HOURS = 72;
export const REVIEW_WINDOW_MS = REVIEW_WINDOW_HOURS * 60 * 60 * 1000;

const MINUTE = 60_000;

/** When a share created at `createdAt` stops taking client comments and snapshots (epoch ms). */
export function reviewDeadline(createdAt: number): number {
  return createdAt + REVIEW_WINDOW_MS;
}

export function reviewClosed(createdAt: number, now: number): boolean {
  return now >= reviewDeadline(createdAt);
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
