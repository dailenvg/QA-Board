import type { Comment } from "@/lib/store/types";

/**
 * A client's comment posted without its screenshot. A review link's server
 * says so (`screenshotPending`); the workspace reads it from a client's
 * comment without a crop, since every comment a client posts carries one
 * unless every try to render or upload it failed.
 */
export function isScreenshotPending(comment: Comment): boolean {
  return comment.screenshotPending === true || (comment.fromClient === true && !comment.crop);
}
