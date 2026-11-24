import { relativeTime } from "@/lib/relative-time";
import type { Reply } from "@/lib/store/types";

export interface ThreadSummary {
  /** "1 reply", "3 replies". */
  count: string;
  /** Who replied last. */
  author: string;
  /** When, "5 minutes ago": never in the future when this clock is behind the server's. */
  when: string;
  /** The latest reply's time (epoch ms), for `<time dateTime>`. */
  at: number;
}

/**
 * The line an unselected card shows for its thread (U1): how many replies,
 * and the latest one's author and time. Null without replies. `replies` are
 * oldest first (`threadsOf`).
 */
export function threadSummary(replies: readonly Reply[], now: number): ThreadSummary | null {
  const latest = replies.at(-1);
  if (!latest) return null;
  return {
    count: replies.length === 1 ? "1 reply" : `${replies.length} replies`,
    author: latest.author,
    when: relativeTime(Math.min(latest.createdAt, now || latest.createdAt), now),
    at: latest.createdAt,
  };
}
