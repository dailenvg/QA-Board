import { relativeTime } from "@/lib/relative-time";
import type { Reply } from "@/lib/store/types";

export interface ThreadSummary {
  /** "1 reply", "3 replies". */
  count: string;
  /**
   * How many of them are team only under a comment clients see (057): those that stayed back when
   * it was shown, or were written so. 0 under a team-only comment, whose chip covers them all.
   */
  teamOnly: number;
  /** All of them together, for screen readers: "3 replies, 1 of them team only" (`teamOnly` > 0). */
  spoken: string;
  /** Who replied last. */
  author: string;
  /** When, "5 minutes ago": never in the future when this clock is behind the server's. */
  when: string;
  /** The latest reply's time (epoch ms), for `<time dateTime>`. */
  at: number;
}

/** "3 replies, 1 of them team only", "3 replies, all team only", "1 reply, team only". */
function spokenCount(total: number, count: string, teamOnly: number): string {
  if (teamOnly === 0) return count;
  if (total === 1) return "1 reply, team only";
  if (teamOnly === total) return `${count}, all team only`;
  return `${count}, ${teamOnly} of them team only`;
}

/**
 * The line an unselected card shows for its thread (U1): how many replies,
 * how many of those are team only (U20), and the latest one's author and
 * time. Null without replies. `replies` are oldest first (`threadsOf`).
 */
export function threadSummary(
  replies: readonly Reply[],
  now: number,
  commentTeamOnly = false,
): ThreadSummary | null {
  const latest = replies.at(-1);
  if (!latest) return null;
  const count = replies.length === 1 ? "1 reply" : `${replies.length} replies`;
  const teamOnly = commentTeamOnly ? 0 : replies.filter((reply) => reply.teamOnly).length;
  return {
    count,
    teamOnly,
    spoken: spokenCount(replies.length, count, teamOnly),
    author: latest.author,
    when: relativeTime(Math.min(latest.createdAt, now || latest.createdAt), now),
    at: latest.createdAt,
  };
}
