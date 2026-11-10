import { relativeTime } from "@/lib/relative-time";

interface TimeAgoProps {
  at: number;
  /** From `useNow`: 0 on the server and in hydration, which show no words yet. */
  now: number;
}

/** "5 minutes ago", as a `<time>`. Empty until the clock is known, so server and browser agree. */
export function TimeAgo({ at, now }: TimeAgoProps) {
  return <time dateTime={new Date(at).toISOString()}>{now ? relativeTime(at, now) : ""}</time>;
}
