import { reviewLinkPath } from "./share-client/reviewer-name";
import { projectHref } from "./routes";
import type { SearchParams } from "./search-params";
import { single } from "./search-params";

/** The query parameter a link names its comment by: `/p/<projectId>?comment=<id>`. */
export const COMMENT_PARAM = "comment";

/** The viewer's page parameter (`useViewerPage`), kept through sign-in with the comment. */
const PAGE_PARAM = "page";

/** What the workspace and review-link APIs take as an id: anything else names no comment. */
const COMMENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A page number a `?page=` can name: 1 to 9999, no leading zero. */
const PAGE_NUMBER = /^[1-9]\d{0,3}$/;

function withComment(path: string, commentId: string): string {
  return `${path}?${COMMENT_PARAM}=${encodeURIComponent(commentId)}`;
}

/** The team's link to a comment: its project, opened on it (D14). */
export function projectCommentHref(projectId: string, commentId: string): string {
  return withComment(projectHref(projectId), commentId);
}

/** A guest's link to a comment on their review link. */
export function reviewCommentHref(token: string, commentId: string): string {
  return withComment(reviewLinkPath(token), commentId);
}

/** `href` (a path on this site) as an absolute URL, for the clipboard. Browser only. */
export function absoluteHref(href: string): string {
  return new URL(href, window.location.origin).href;
}

/** The comment a `?comment=` value names; null when there's none, or it can't be an id. */
export function parseCommentParam(value: string | null | undefined): string | null {
  return value && COMMENT_ID.test(value) ? value : null;
}

/** `url` without its `?comment=`, the rest of its query (such as `?page=`) and hash kept. */
export function withoutCommentParam(url: URL): URL {
  const next = new URL(url);
  next.searchParams.delete(COMMENT_PARAM);
  return next;
}

/**
 * A project's link as it was asked for, for Sign in to return to: its
 * `?comment=` and `?page=`, each only when well formed, and nothing else.
 */
export function projectReturnHref(projectId: string, search: SearchParams): string {
  const query = new URLSearchParams();
  const page = single(search[PAGE_PARAM]);
  if (page && PAGE_NUMBER.test(page)) query.set(PAGE_PARAM, page);
  const comment = parseCommentParam(single(search[COMMENT_PARAM]));
  if (comment) query.set(COMMENT_PARAM, comment);
  const rest = query.toString();
  return rest ? `${projectHref(projectId)}?${rest}` : projectHref(projectId);
}
