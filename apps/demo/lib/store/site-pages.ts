import { pageKey, pagePath } from "../page-address";
import { breakpointOf, breakpointOfComment, type Breakpoint } from "./breakpoints";
import type { Comment, Snapshot } from "./types";

/**
 * A website project is reviewed page by page. A page is never stored on its
 * own: it's read from where its snapshots were captured (`sourceUrl`), and a
 * comment is on its snapshot's page. Comments from before snapshots (pinned
 * on the live frame) and comments whose snapshot is gone are on the
 * project's own page, its `home` (`pageKey` of the project's address).
 */
export function pageOfSnapshot(snapshot: Snapshot, home: string): string {
  return pageKey(snapshot.sourceUrl) ?? home;
}

export function pageOfComment(
  comment: Comment,
  snapshots: ReadonlyMap<string, Snapshot>,
  home: string,
): string {
  const snapshot = comment.snapshotId ? snapshots.get(comment.snapshotId) : undefined;
  return snapshot ? pageOfSnapshot(snapshot, home) : home;
}

/** The newest snapshot of `page` at `breakpoint`, from a list oldest first. */
export function latestSnapshotOf(
  snapshots: readonly Snapshot[],
  breakpoint: Breakpoint,
  page: string,
  home: string,
): Snapshot | null {
  return (
    snapshots.findLast(
      (snapshot) =>
        breakpointOf(snapshot.width) === breakpoint && pageOfSnapshot(snapshot, home) === page,
    ) ?? null
  );
}

/** Active (unresolved) comments on each page, at every breakpoint, by page. */
export function activeByPage(
  comments: readonly Comment[],
  snapshots: ReadonlyMap<string, Snapshot>,
  home: string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const comment of comments) {
    if (comment.status !== "active") continue;
    const page = pageOfComment(comment, snapshots, home);
    counts.set(page, (counts.get(page) ?? 0) + 1);
  }
  return counts;
}

/**
 * The pages to offer: the project's own page first, then every page captured
 * so far and the one being viewed (even before its first snapshot), by path.
 */
export function reviewedPages(
  snapshots: readonly Snapshot[],
  home: string,
  current: string,
): string[] {
  const others = new Set([current, ...snapshots.map((snapshot) => pageOfSnapshot(snapshot, home))]);
  others.delete(home);
  return [
    home,
    ...[...others].sort((a, b) => pagePath(a).localeCompare(pagePath(b)) || a.localeCompare(b)),
  ];
}

/** Which website comments the panel lists: one breakpoint, and one page or (`page` null) all. */
export interface SiteScope {
  breakpoint: Breakpoint;
  page: string | null;
  home: string;
}

export function commentsInScope(
  comments: readonly Comment[],
  snapshots: ReadonlyMap<string, Snapshot>,
  { breakpoint, page, home }: SiteScope,
): Comment[] {
  return comments.filter(
    (comment) =>
      breakpointOfComment(comment, snapshots) === breakpoint &&
      (page === null || pageOfComment(comment, snapshots, home) === page),
  );
}
