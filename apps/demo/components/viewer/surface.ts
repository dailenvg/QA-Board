import type { Comment, Page, ProjectSource, Snapshot } from "@/lib/store/types";
import type { ViewerMode } from "./types";

type SourceKind = ProjectSource["kind"];

/** What the stage can show of a project: a website, or the page being viewed. */
export type StageSource = { kind: "url" } | { kind: "pages"; page: Page };

/** What the stage shows, and so which pins it can draw. */
export type Surface =
  /** A website's live iframe (Browse mode). Only older, frame-anchored pins are drawn on it. */
  | { kind: "frame" }
  | { kind: "page"; page: Page }
  /** `snapshot` is null until a website project's first capture lands. */
  | { kind: "snapshot"; snapshot: Snapshot | null };

/** Where a comment's pin was placed, when that isn't the surface new comments go on. */
export type Placement =
  /** A website comment from before snapshots, anchored to the visible frame. */
  | { kind: "live" }
  | { kind: "earlier"; at: number }
  /** Its snapshot is no longer in the saved data. */
  | { kind: "missing" };

/** Viewer state that shows a comment's own surface. */
export interface SurfaceTarget {
  mode: ViewerMode | null;
  viewedSnapshotId: string | null;
  /** The page to show; null leaves the page as it is. */
  pageId: string | null;
}

/**
 * Websites: the live frame in Browse mode, a snapshot in Comment mode (the
 * viewed one, else the latest). Page projects: the page, unless an older
 * snapshot from the project's website days is being viewed.
 */
export function stageSurface(
  source: StageSource,
  mode: ViewerMode,
  viewed: Snapshot | null,
  latest: Snapshot | null,
): Surface {
  if (source.kind === "pages") {
    return viewed ? { kind: "snapshot", snapshot: viewed } : { kind: "page", page: source.page };
  }
  if (mode === "browse") return { kind: "frame" };
  return { kind: "snapshot", snapshot: viewed ?? latest };
}

export function surfaceKey(surface: Surface): string {
  if (surface.kind === "snapshot") return `snapshot:${surface.snapshot?.id ?? "none"}`;
  return surface.kind === "page" ? `page:${surface.page.id}` : surface.kind;
}

/** Key of the surface a comment's pin is drawn on. */
export function commentSurfaceKey(comment: Comment): string {
  if (comment.snapshotId) return `snapshot:${comment.snapshotId}`;
  return comment.pageId ? `page:${comment.pageId}` : "frame";
}

export function placementOf(
  comment: Comment,
  kind: SourceKind,
  snapshots: ReadonlyMap<string, Snapshot>,
  latestId: string | null,
): Placement | null {
  if (!comment.snapshotId) return kind === "url" ? { kind: "live" } : null;
  const snapshot = snapshots.get(comment.snapshotId);
  if (!snapshot) return { kind: "missing" };
  if (kind === "url" && snapshot.id === latestId) return null;
  return { kind: "earlier", at: snapshot.createdAt };
}

/** How to bring a comment's surface onto the stage, or null when it can't be shown. */
export function surfaceTargetOf(
  comment: Comment,
  kind: SourceKind,
  snapshots: ReadonlyMap<string, Snapshot>,
  latestId: string | null,
): SurfaceTarget | null {
  if (!comment.snapshotId) {
    return {
      mode: kind === "url" ? "browse" : null,
      viewedSnapshotId: null,
      pageId: comment.pageId ?? null,
    };
  }
  if (!snapshots.has(comment.snapshotId)) return null;
  if (kind === "pages") {
    return { mode: null, viewedSnapshotId: comment.snapshotId, pageId: null };
  }
  const viewedSnapshotId = comment.snapshotId === latestId ? null : comment.snapshotId;
  return { mode: "comment", viewedSnapshotId, pageId: null };
}
