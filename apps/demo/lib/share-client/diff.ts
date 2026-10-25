import { digest } from "../share/digest";
import { SHARE_LIMITS } from "../share/limits";
import type { ShareChange, ShareManifest, ShareState } from "../share/types";

type Changes = Omit<ShareChange, "cursor">;

/** What differs between the owner's state and the server's manifest. */
export function diffState(local: ShareState, manifest: ShareManifest): Changes {
  const changed = <T extends { id: string }>(
    items: readonly T[],
    remote: ShareManifest["comments"],
  ) => {
    const known = new Map(remote.map((entry) => [entry.id, entry.digest]));
    return items.filter((item) => known.get(item.id) !== digest(item));
  };
  const gone = (items: ReadonlyArray<{ id: string }>, remote: ShareManifest["comments"]) => {
    const ids = new Set(items.map((item) => item.id));
    return remote.filter((entry) => !ids.has(entry.id)).map((entry) => entry.id);
  };
  return {
    ...(digest(local.project) !== manifest.project ? { project: local.project } : {}),
    snapshots: changed(local.snapshots, manifest.snapshots),
    comments: changed(local.comments, manifest.comments),
    deleteSnapshots: gone(local.snapshots, manifest.snapshots),
    deleteComments: gone(local.comments, manifest.comments),
  };
}

export function isEmpty(changes: Changes): boolean {
  return (
    !changes.project &&
    changes.snapshots.length === 0 &&
    changes.comments.length === 0 &&
    changes.deleteSnapshots.length === 0 &&
    changes.deleteComments.length === 0
  );
}

/**
 * Splits changes into requests of at most `maxBytes` of JSON each. The first
 * carries the project and every delete (ids are small); upserts fill batches
 * in order. None when nothing changed.
 */
export function batchChange(
  changes: Changes,
  cursor: number,
  maxBytes: number = SHARE_LIMITS.changeBatchBytes,
): ShareChange[] {
  if (isEmpty(changes)) return [];
  const empty = (): ShareChange => ({
    snapshots: [],
    comments: [],
    deleteSnapshots: [],
    deleteComments: [],
    cursor,
  });
  const first: ShareChange = {
    ...empty(),
    ...(changes.project ? { project: changes.project } : {}),
    deleteSnapshots: changes.deleteSnapshots,
    deleteComments: changes.deleteComments,
  };
  const batches = [first];
  let size = JSON.stringify(first).length;
  const add = (
    kind: "snapshots" | "comments",
    item: ShareChange["comments"][number] | ShareChange["snapshots"][number],
  ) => {
    const itemSize = JSON.stringify(item).length + 1;
    let batch = batches[batches.length - 1] ?? first;
    if (size + itemSize > maxBytes && (batch.snapshots.length || batch.comments.length)) {
      batch = empty();
      batches.push(batch);
      size = JSON.stringify(batch).length;
    }
    (batch[kind] as unknown[]).push(item);
    size += itemSize;
  };
  for (const snapshot of changes.snapshots) add("snapshots", snapshot);
  for (const comment of changes.comments) add("comments", comment);
  return batches;
}
