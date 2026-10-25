import type { Comment, Snapshot } from "./types";

/** The device widths a website project is reviewed at. */
export type Breakpoint = "desktop" | "tablet" | "mobile";

export const BREAKPOINTS: readonly Breakpoint[] = ["desktop", "tablet", "mobile"];

/** Page width in CSS px each breakpoint is captured (and framed) at. */
export const BREAKPOINT_WIDTH: Record<Breakpoint, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 390,
};

/**
 * The breakpoint a page width belongs to. Snapshots taken before breakpoints
 * were captured at the stage's width, so the bands are wide enough to place
 * those sensibly too.
 */
export function breakpointOf(width: number): Breakpoint {
  if (width >= 1024) return "desktop";
  return width >= 640 ? "tablet" : "mobile";
}

/**
 * Where a website comment is listed: its snapshot's breakpoint. Comments from
 * before snapshots (anchored to the full-width live frame) and comments whose
 * snapshot is gone are listed under Desktop.
 */
export function breakpointOfComment(
  comment: Comment,
  snapshots: ReadonlyMap<string, Snapshot>,
): Breakpoint {
  const snapshot = comment.snapshotId ? snapshots.get(comment.snapshotId) : undefined;
  return snapshot ? breakpointOf(snapshot.width) : "desktop";
}

/** Active (unresolved) comments at each breakpoint, for the breakpoint switcher. */
export function activeByBreakpoint(
  comments: readonly Comment[],
  snapshots: ReadonlyMap<string, Snapshot>,
): Record<Breakpoint, number> {
  const counts: Record<Breakpoint, number> = { desktop: 0, tablet: 0, mobile: 0 };
  for (const comment of comments) {
    if (comment.status === "active") counts[breakpointOfComment(comment, snapshots)] += 1;
  }
  return counts;
}
