import { SQUINT_BRAND } from "./brand";
import type { ShareStore } from "./store";
import { hashesMatch } from "./tokens";
import type {
  BlobLocation,
  Origin,
  Sequenced,
  SharedComment,
  SharedReply,
  SharedSnapshot,
  ShareRecord,
  StoredBlob,
} from "./types";

interface Entry {
  record: ShareRecord;
  snapshots: Map<string, Sequenced<SharedSnapshot>>;
  comments: Map<string, Sequenced<SharedComment>>;
  replies: Map<string, Sequenced<SharedReply>>;
  blobs: Map<string, StoredBlob>;
  parts: Map<string, Map<number, Uint8Array>>;
  /** Pending comment ids, and the claim holding each. */
  pending: Map<string, string>;
  /** Pending snapshot ids. */
  pendingSnapshots: Set<string>;
  /** The edit key hash of each client comment posted with one (045). */
  editKeys: Map<string, string>;
}

const bySeq = <T>(a: Sequenced<T>, b: Sequenced<T>) => a.seq - b.seq;
const done = <T>(value: T): Promise<T> => Promise.resolve(value);

/**
 * Shares in this server process's memory. Local development and e2e only:
 * every instance has its own, and a restart forgets them. None belongs to a
 * workspace, so each has Squint's own brand.
 */
export function createMemoryStore(): ShareStore {
  const shares = new Map<string, Entry>();
  let seq = 0;

  const upsert = <T extends { id: string }>(
    map: Map<string, Sequenced<T>> | undefined,
    item: T,
    origin: Origin,
  ) => {
    if (!map) return;
    const existing = map.get(item.id);
    map.set(item.id, existing ? { ...existing, item } : { item, origin, seq: (seq += 1) });
  };

  /** A visible comment of the share, as a reply needs its parent to be. */
  const visibleComment = (entry: Entry | undefined, commentId: string) =>
    Boolean(entry?.comments.has(commentId) && !entry.pending.has(commentId));

  /** Deletes a comment with everything under it: its replies, as the foreign key cascades. */
  const dropComment = (entry: Entry | undefined, commentId: string) => {
    entry?.comments.delete(commentId);
    entry?.pending.delete(commentId);
    entry?.editKeys.delete(commentId);
    for (const [replyId, row] of entry?.replies ?? []) {
      if (row.item.commentId === commentId) entry?.replies.delete(replyId);
    }
  };

  /** A visible client comment's row, as `CLIENT_ROW` finds it in Postgres. */
  const clientRow = (entry: Entry | undefined, commentId: string) => {
    const row = entry?.comments.get(commentId);
    return row?.origin === "client" && !entry?.pending.has(commentId) ? row : undefined;
  };

  const removeBlobs = (entry: Entry | undefined, keys: readonly string[]): BlobLocation[] =>
    keys.flatMap((key) => {
      const blob = entry?.blobs.get(key);
      entry?.blobs.delete(key);
      return blob ? [blob.location] : [];
    });

  return {
    create(record) {
      shares.set(record.id, {
        record,
        snapshots: new Map(),
        comments: new Map(),
        replies: new Map(),
        blobs: new Map(),
        parts: new Map(),
        pending: new Map(),
        pendingSnapshots: new Set(),
        editKeys: new Map(),
      });
      return done(undefined);
    },
    byId: (id) => done(shares.get(id)?.record ?? null),
    byTokenHash: (tokenHash) =>
      done(
        [...shares.values()].find((entry) => entry.record.tokenHash === tokenHash)?.record ?? null,
      ),
    // No workspaces in memory, so nothing is ever suspended.
    pausedByTokenHash: () => done(null),
    exists: (id) => done(shares.has(id)),
    setProject(id, project, at, expiresAt) {
      const entry = shares.get(id);
      if (entry) entry.record = { ...entry.record, project, updatedAt: at, expiresAt };
      return done(undefined);
    },
    remove(id) {
      const entry = shares.get(id);
      shares.delete(id);
      return done([...(entry?.blobs.values() ?? [])].map((blob) => blob.location));
    },
    expiredIds(now, limit) {
      const expired = [...shares.values()]
        .map((entry) => entry.record)
        .flatMap((record) =>
          record.expiresAt !== null && record.expiresAt <= now
            ? [{ id: record.id, expiresAt: record.expiresAt }]
            : [],
        )
        .sort((a, b) => a.expiresAt - b.expiresAt || a.id.localeCompare(b.id));
      return done(expired.slice(0, limit).map((record) => record.id));
    },
    // Shares in memory are never a workspace's: no company, and no team.
    brandOf: () => done(SQUINT_BRAND),
    brandLogo: () => done(null),
    teamAuthors: () => done(new Map()),
    teamReplyAuthors: () => done(new Map()),
    teamAvatar: () => done(null),
    snapshots(id, options) {
      const entry = shares.get(id);
      const visible = [...(entry?.snapshots.values() ?? [])].filter(
        (row) => options?.includePending || !entry?.pendingSnapshots.has(row.item.id),
      );
      return done(visible.sort(bySeq));
    },
    comments(id, options) {
      const entry = shares.get(id);
      const visible = [...(entry?.comments.values() ?? [])].filter(
        (row) => options?.includePending || !entry?.pending.has(row.item.id),
      );
      return done(visible.sort(bySeq));
    },
    upsertSnapshot(id, snapshot, origin) {
      upsert(shares.get(id)?.snapshots, snapshot, origin);
      return done(undefined);
    },
    upsertComment(id, comment, origin) {
      const comments = shares.get(id)?.comments;
      const existing = comments?.get(comment.id);
      // A client's row only takes where the pin is (4.12) and the team's priority (D26), as
      // `UPSERT_COMMENT` does: a push without a priority clears it.
      if (existing?.origin === "client") {
        const { priority: _previous, ...item } = existing.item;
        const pageId = comment.pageId ?? item.pageId;
        comments?.set(comment.id, {
          ...existing,
          item: {
            ...item,
            ...(pageId === undefined ? {} : { pageId }),
            ...(comment.priority ? { priority: comment.priority } : {}),
          },
        });
      } else upsert(comments, comment, origin);
      return done(undefined);
    },
    insertPendingSnapshot(id, snapshot) {
      const entry = shares.get(id);
      if (entry && !entry.snapshots.has(snapshot.id)) {
        upsert(entry.snapshots, snapshot, "client");
        entry.pendingSnapshots.add(snapshot.id);
      }
      return done(undefined);
    },
    confirmSnapshot(id, snapshotId) {
      const entry = shares.get(id);
      const row = entry?.snapshots.get(snapshotId);
      if (!entry || !row || !entry.pendingSnapshots.delete(snapshotId)) return done(false);
      entry.snapshots.set(snapshotId, { ...row, seq: (seq += 1) });
      return done(true);
    },
    deleteStalePendingSnapshots(id, cutoff) {
      const entry = shares.get(id);
      const stale = [...(entry?.pendingSnapshots ?? [])].filter(
        (pendingId) => (entry?.snapshots.get(pendingId)?.item.createdAt ?? Infinity) < cutoff,
      );
      for (const staleId of stale) {
        entry?.pendingSnapshots.delete(staleId);
        entry?.snapshots.delete(staleId);
      }
      return done(stale);
    },
    insertComment(id, comment, origin, claim, editKeyHash, clientInfo) {
      const entry = shares.get(id);
      if (!entry || entry.comments.has(comment.id)) return done(false);
      upsert(entry.comments, comment, origin);
      const inserted = entry.comments.get(comment.id);
      if (inserted && clientInfo) entry.comments.set(comment.id, { ...inserted, clientInfo });
      if (editKeyHash) entry.editKeys.set(comment.id, editKeyHash);
      if (claim) {
        entry.pending.set(comment.id, claim.claim);
        const row = entry.comments.get(comment.id);
        if (row) entry.comments.set(comment.id, { ...row, cropKey: claim.cropKey });
      }
      return done(true);
    },
    confirmComment(id, commentId, claim) {
      const entry = shares.get(id);
      const row = entry?.comments.get(commentId);
      if (!entry || !row || entry.pending.get(commentId) !== claim) return done(false);
      entry.pending.delete(commentId);
      entry.comments.set(commentId, { ...row, seq: (seq += 1) });
      return done(true);
    },
    editClientComment(id, commentId, editKeyHash, body, now) {
      const entry = shares.get(id);
      const row = clientRow(entry, commentId);
      const stored = entry?.editKeys.get(commentId);
      if (!entry || !row || !stored || !hashesMatch(editKeyHash, stored)) return done("missing");
      if (row.item.status !== "active") return done("locked");
      const item = { ...row.item, body, editedAt: now, updatedAt: now };
      entry.comments.set(commentId, { ...row, item, editSeq: (seq += 1) });
      return done(item);
    },
    setClientCommentStatus(id, commentId, { status, resolvedAt, updatedAt }) {
      const entry = shares.get(id);
      const row = clientRow(entry, commentId);
      if (!entry || !row) return done(false);
      const { resolvedAt: _previous, ...rest } = row.item;
      const item =
        status === "resolved" && resolvedAt !== null
          ? { ...rest, status, resolvedAt, updatedAt }
          : { ...rest, status, updatedAt };
      entry.comments.set(commentId, { ...row, item });
      return done(true);
    },
    deleteClaim(id, commentId, claim) {
      const entry = shares.get(id);
      if (!entry || entry.pending.get(commentId) !== claim) return done(false);
      dropComment(entry, commentId);
      return done(true);
    },
    cropKeyOf(id, commentId) {
      const entry = shares.get(id);
      const row = entry?.pending.has(commentId) ? undefined : entry?.comments.get(commentId);
      return done(row?.item.crop ? (row.cropKey ?? `crop:${commentId}`) : null);
    },
    pendingSince(id, commentId) {
      const entry = shares.get(id);
      const row = entry?.pending.has(commentId) ? entry.comments.get(commentId) : undefined;
      return done(row ? row.item.createdAt : null);
    },
    deleteStalePending(id, cutoff, commentId) {
      const entry = shares.get(id);
      const stale = [...(entry?.pending.keys() ?? [])].filter(
        (pendingId) =>
          (commentId === undefined || pendingId === commentId) &&
          (entry?.comments.get(pendingId)?.item.createdAt ?? Infinity) < cutoff,
      );
      for (const staleId of stale) dropComment(entry, staleId);
      return done(stale);
    },
    deleteSnapshots(id, ids) {
      for (const snapshotId of ids) {
        shares.get(id)?.snapshots.delete(snapshotId);
        shares.get(id)?.pendingSnapshots.delete(snapshotId);
      }
      return done(undefined);
    },
    deleteComments(id, ids) {
      for (const commentId of ids) dropComment(shares.get(id), commentId);
      return done(undefined);
    },
    replies: (id) => done([...(shares.get(id)?.replies.values() ?? [])].sort(bySeq)),
    upsertReply(id, reply) {
      const entry = shares.get(id);
      const existing = entry?.replies.get(reply.id);
      // As `UPSERT_REPLY`: only under a visible comment, and never over a client's row or a
      // reply to another comment.
      const kept =
        existing && (existing.origin === "client" || existing.item.commentId !== reply.commentId);
      if (entry && visibleComment(entry, reply.commentId) && !kept) {
        upsert(entry.replies, reply, "owner");
      }
      return done(undefined);
    },
    addClientReply(id, reply, caps, clientInfo) {
      const entry = shares.get(id);
      if (entry?.replies.has(reply.id)) return done("exists");
      if (!entry || !visibleComment(entry, reply.commentId)) return done("missing");
      if (entry.comments.get(reply.commentId)?.item.status !== "active") return done("locked");
      const rows = [...entry.replies.values()];
      const thread = rows.filter((row) => row.item.commentId === reply.commentId).length;
      if (rows.length >= caps.link || thread >= caps.comment) return done("full");
      entry.replies.set(reply.id, {
        item: reply,
        origin: "client",
        seq: (seq += 1),
        ...(clientInfo ? { clientInfo } : {}),
      });
      return done("added");
    },
    deleteReplies(id, ids) {
      for (const replyId of ids) shares.get(id)?.replies.delete(replyId);
      return done(undefined);
    },
    // Shares in memory belong to no workspace, so nothing is team only: the lock has nothing to
    // guard. The store it's called on runs the callback, a wrapper (tests) included.
    withShareLock(_id, run) {
      return run(this);
    },
    // No workspaces in memory, so no project keeps anything to its team.
    teamOnlyIds: () => done({ comments: new Set<string>(), replies: new Set<string>() }),
    blobSizes: (id) =>
      done([...(shares.get(id)?.blobs.values() ?? [])].map(({ key, size }) => ({ key, size }))),
    getBlob: (id, key) => done(shares.get(id)?.blobs.get(key) ?? null),
    putBlob(id, blob) {
      shares.get(id)?.blobs.set(blob.key, blob);
      return done(undefined);
    },
    deleteBlobs: (id, keys) => done(removeBlobs(shares.get(id), keys)),
    putBlobPart(id, key, part, bytes) {
      const entry = shares.get(id);
      if (entry) {
        const parts = entry.parts.get(key) ?? new Map<number, Uint8Array>();
        parts.set(part, bytes);
        entry.parts.set(key, parts);
      }
      return done(undefined);
    },
    blobParts: (id, key) =>
      done(
        [...(shares.get(id)?.parts.get(key) ?? new Map<number, Uint8Array>())]
          .map(([part, bytes]) => ({ part, bytes }))
          .sort((a, b) => a.part - b.part),
      ),
    deleteBlobParts(id, key) {
      shares.get(id)?.parts.delete(key);
      return done(undefined);
    },
  };
}
