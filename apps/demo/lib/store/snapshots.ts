import type { Snapshot, SquintData } from "./types";

/** A project's snapshots, oldest first. */
export function snapshotsFor(data: SquintData, projectId: string): Snapshot[] {
  return data.snapshots
    .filter((snapshot) => snapshot.projectId === projectId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** The newest snapshot of each project, by project id. */
function latestByProject(snapshots: readonly Snapshot[]): Map<string, Snapshot> {
  const latest = new Map<string, Snapshot>();
  for (const snapshot of snapshots) {
    const current = latest.get(snapshot.projectId);
    if (!current || snapshot.createdAt >= current.createdAt)
      latest.set(snapshot.projectId, snapshot);
  }
  return latest;
}

/** Older snapshots nobody commented on: replaced by a newer one and safe to drop. */
export function prunableSnapshotIds(data: SquintData): Set<string> {
  const latest = new Set([...latestByProject(data.snapshots).values()].map((s) => s.id));
  const referenced = new Set(data.comments.flatMap((comment) => comment.snapshotId ?? []));
  return new Set(
    data.snapshots
      .filter((snapshot) => !latest.has(snapshot.id) && !referenced.has(snapshot.id))
      .map((snapshot) => snapshot.id),
  );
}

/** Every blob the saved data still points at: project images, snapshots and comment crops. */
export function referencedBlobKeys(data: SquintData): Set<string> {
  return new Set([
    ...data.projects.flatMap((project) =>
      project.source.kind === "image" ? [project.source.blobKey] : [],
    ),
    ...data.snapshots.map((snapshot) => snapshot.blobKey),
    ...data.comments.flatMap((comment) => comment.crop?.blobKey ?? []),
  ]);
}
