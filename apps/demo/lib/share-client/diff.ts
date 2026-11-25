import { digest } from "../share/digest";
import { SHARE_LIMITS } from "../share/limits";
import type { ShareChange, ShareManifest, ShareState } from "../share/types";

type Changes = Omit<ShareChange, "cursor">;

/** What a batch upserts, in the order they're sent. */
const UPSERTS = ["snapshots", "comments", "replies"] as const;
type Upserts = (typeof UPSERTS)[number];

/**
 * What differs between the owner's state and the server's manifest. Replies
 * in `settled` (clients', `clientReplyIds`) are only sent while the server
 * lacks them: it keeps a client's reply as it is, so sending one it has
 * again, however it differs, would only repeat on every push.
 */
export function diffState(
  local: ShareState,
  manifest: ShareManifest,
  settled: ReadonlySet<string> = new Set(),
): Changes {
  const changed = <T extends { id: string }>(
    items: readonly T[],
    remote: ShareManifest["comments"],
  ) => {
    const known = new Map(remote.map((entry) => [entry.id, entry.digest]));
    return items.filter((item) => known.get(item.id) !== digest(item));
  };
  const remoteReplies = new Set(manifest.replies.map((entry) => entry.id));
  const replies = changed(local.replies, manifest.replies).filter(
    (reply) => !settled.has(reply.id) || !remoteReplies.has(reply.id),
  );
  const gone = (items: ReadonlyArray<{ id: string }>, remote: ShareManifest["comments"]) => {
    const ids = new Set(items.map((item) => item.id));
    return remote.filter((entry) => !ids.has(entry.id)).map((entry) => entry.id);
  };
  return {
    ...(digest(local.project) !== manifest.project ? { project: local.project } : {}),
    snapshots: changed(local.snapshots, manifest.snapshots),
    comments: changed(local.comments, manifest.comments),
    replies,
    deleteSnapshots: gone(local.snapshots, manifest.snapshots),
    deleteComments: gone(local.comments, manifest.comments),
    deleteReplies: gone(local.replies, manifest.replies),
  };
}

export function isEmpty(changes: Changes): boolean {
  return (
    !changes.project &&
    changes.snapshots.length === 0 &&
    changes.comments.length === 0 &&
    changes.replies.length === 0 &&
    changes.deleteSnapshots.length === 0 &&
    changes.deleteComments.length === 0 &&
    changes.deleteReplies.length === 0
  );
}

/**
 * Splits changes into requests of at most `maxBytes` of JSON each. The first
 * carries the project and every delete (ids are small); upserts fill batches
 * in order: snapshots, comments, then replies, so a reply's comment always
 * reaches the server in the same batch or an earlier one. None when nothing changed.
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
    replies: [],
    deleteSnapshots: [],
    deleteComments: [],
    deleteReplies: [],
    cursor,
  });
  const first: ShareChange = {
    ...empty(),
    ...(changes.project ? { project: changes.project } : {}),
    deleteSnapshots: changes.deleteSnapshots,
    deleteComments: changes.deleteComments,
    deleteReplies: changes.deleteReplies,
  };
  const batches = [first];
  let size = JSON.stringify(first).length;
  const add = <Kind extends Upserts>(kind: Kind, item: ShareChange[Kind][number]) => {
    const itemSize = JSON.stringify(item).length + 1;
    let batch = batches[batches.length - 1] ?? first;
    if (size + itemSize > maxBytes && UPSERTS.some((upserts) => batch[upserts].length)) {
      batch = empty();
      batches.push(batch);
      size = JSON.stringify(batch).length;
    }
    (batch[kind] as unknown[]).push(item);
    size += itemSize;
  };
  for (const snapshot of changes.snapshots) add("snapshots", snapshot);
  for (const comment of changes.comments) add("comments", comment);
  for (const reply of changes.replies) add("replies", reply);
  return batches;
}
