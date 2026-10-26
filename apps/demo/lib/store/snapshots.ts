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
 * The newest snapshot of each project at each breakpoint, keyed by project id
 * and breakpoint: a new mobile capture doesn't replace the desktop one.
 */
function latestByBreakpoint(snapshots: readonly Snapshot[]): Map<string, Snapshot> {
  const latest = new Map<string, Snapshot>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.projectId}:${breakpointOf(snapshot.width)}`;
    const current = latest.get(key);
    if (!current || snapshot.createdAt >= current.createdAt) latest.set(key, snapshot);
  }
  return latest;
}

/**
 * The picture for a website project's card: its newest desktop snapshot, else
 * its newest snapshot at any breakpoint. Null before the first capture.
 */
export function previewSnapshot(data: SquintData, projectId: string): Snapshot | null {
  const list = snapshotsFor(data, projectId);
  return (
    list.findLast((snapshot) => breakpointOf(snapshot.width) === "desktop") ?? list.at(-1) ?? null
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
