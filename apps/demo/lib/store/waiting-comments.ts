import type { ClientCommentActivity } from "../workspace/types";
import type { CommentCounts } from "./status";
import type { SquintData } from "./types";

/**
 * Clients' open comments still waiting on a project's review link: posted
 * there, not pulled into the workspace yet, so not in `data.comments`. Every
 * open-comment count adds them (`withWaiting`), so a guest's comment shows on
 * the cards before anyone opens the project.
 */

/** When each still-waiting comment was posted, newest first, by project id. */
export type WaitingComments = ReadonlyMap<string, readonly number[]>;

/** How many comments are still waiting on each project's review link, by project id. */
export type WaitingCounts = ReadonlyMap<string, number>;

export const NO_WAITING: WaitingCounts = new Map();

/**
 * The comments the server read as waiting (`activity`) that are still waiting
 * in `data`, for its projects. Nothing is counted twice: a pull since the read
 * moved the link's cursor past the read's and brought them all into
 * `data.comments`, so the project's entry is dropped; and a comment a pull
 * brought in without moving the cursor (an image it has to fetch again holds
 * the cursor back) is a client comment in `data` posted at the same moment.
 */
export function waitingComments(
  data: SquintData,
  activity: readonly ClientCommentActivity[],
): WaitingComments {
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const pulledAt = new Map<string, Set<number>>();
  for (const comment of data.comments) {
    if (!comment.fromClient) continue;
    const times = pulledAt.get(comment.projectId) ?? new Set<number>();
    times.add(comment.createdAt);
    pulledAt.set(comment.projectId, times);
  }
  const waiting = new Map<string, readonly number[]>();
  for (const entry of activity) {
    const project = projects.get(entry.projectId);
    if (!project || (project.share?.cursor ?? 0) > entry.cursor) continue;
    const pulled = pulledAt.get(entry.projectId);
    const times = pulled ? entry.waiting.filter((at) => !pulled.has(at)) : entry.waiting;
    if (times.length > 0) waiting.set(entry.projectId, times);
  }
  return waiting;
}

/** How many comments are still waiting on each project's link (`waitingComments`). */
export function waitingCounts(
  data: SquintData,
  activity: readonly ClientCommentActivity[],
): WaitingCounts {
  return new Map(
    [...waitingComments(data, activity)].map(([projectId, times]) => [projectId, times.length]),
  );
}

/** `counts` with the comments still waiting on the project's link counted as open. */
export function withWaiting(counts: CommentCounts, waiting: number): CommentCounts {
  return waiting > 0 ? { ...counts, active: counts.active + waiting } : counts;
}
