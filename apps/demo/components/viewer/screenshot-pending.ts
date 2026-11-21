import type { Comment } from "@/lib/store/types";

/**
 * A client's comment posted without its screenshot. A review link's server
 * says so (`screenshotPending`); the workspace reads it from a client's
 * comment without a crop, since every comment a client posts on a snapshot
 * or a page carries one unless every try to render or upload it failed.
 * One on an older website's live page never had a screenshot to take.
 */
export function isScreenshotPending(comment: Comment): boolean {
  if (comment.screenshotPending === true) return true;
  const onImage = Boolean(comment.snapshotId || comment.pageId);
  return comment.fromClient === true && onImage && !comment.crop;
}
