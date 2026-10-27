import { pageKey } from "../page-address";
import { breakpointOf } from "./breakpoints";
import { pagesOf } from "./pages";
import type { Snapshot, SquintData } from "./types";

/** A project's snapshots, oldest first. */
export function snapshotsFor(data: SquintData, projectId: string): Snapshot[] {
  return data.snapshots
    .filter((snapshot) => snapshot.projectId === projectId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * The newest snapshot of each page of each project at each breakpoint, keyed
 * by project id, breakpoint and page: a new mobile capture doesn't replace the
 * desktop one, and a capture of /pricing doesn't replace the home page's.
 */
function latestByBreakpoint(snapshots: readonly Snapshot[]): Map<string, Snapshot> {
  const latest = new Map<string, Snapshot>();
  for (const snapshot of snapshots) {
    const page = pageKey(snapshot.sourceUrl) ?? snapshot.sourceUrl;
    const key = `${snapshot.projectId}:${breakpointOf(snapshot.width)}:${page}`;
    const current = latest.get(key);
    if (!current || snapshot.createdAt >= current.createdAt) latest.set(key, snapshot);
  }
  return latest;
}

/**
 * The picture for a website project's card: the newest desktop snapshot of
 * its own page, else its newest desktop snapshot of any page, else its newest
 * snapshot. Null before the first capture.
 */
export function previewSnapshot(data: SquintData, projectId: string): Snapshot | null {
  const list = snapshotsFor(data, projectId);
  const project = data.projects.find((entry) => entry.id === projectId);
  const home = project?.source.kind === "url" ? pageKey(project.source.url) : null;
  const desktop = list.filter((snapshot) => breakpointOf(snapshot.width) === "desktop");
  return (
    desktop.findLast((snapshot) => pageKey(snapshot.sourceUrl) === home) ??
    desktop.at(-1) ??
    list.at(-1) ??
    null
  );
}

/**
 * Older snapshots nobody commented on: replaced by a newer one at the same
 * breakpoint and safe to drop, unless a pending Undo holds their image
 * (`held` blob keys).
 */
export function prunableSnapshotIds(
  data: SquintData,
  held: ReadonlySet<string> = new Set(),
): Set<string> {
  const latest = new Set([...latestByBreakpoint(data.snapshots).values()].map((s) => s.id));
  const referenced = new Set(data.comments.flatMap((comment) => comment.snapshotId ?? []));
  return new Set(
    data.snapshots
      .filter(
        (snapshot) =>
          !latest.has(snapshot.id) && !referenced.has(snapshot.id) && !held.has(snapshot.blobKey),
      )
      .map((snapshot) => snapshot.id),
  );
}

/** Every blob the saved data still points at: page images, snapshots and comment crops. */
export function referencedBlobKeys(data: SquintData): Set<string> {
  return new Set([
    ...data.projects.flatMap((project) => pagesOf(project).map((page) => page.blobKey)),
    ...data.snapshots.map((snapshot) => snapshot.blobKey),
    ...data.comments.flatMap((comment) => comment.crop?.blobKey ?? []),
  ]);
}
