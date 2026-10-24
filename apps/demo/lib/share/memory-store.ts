import type { ShareStore } from "./store";
import type {
  BlobLocation,
  Origin,
  Sequenced,
  SharedComment,
  SharedSnapshot,
  ShareRecord,
  StoredBlob,
} from "./types";

interface Entry {
  record: ShareRecord;
  snapshots: Map<string, Sequenced<SharedSnapshot>>;
  comments: Map<string, Sequenced<SharedComment>>;
  blobs: Map<string, StoredBlob>;
  parts: Map<string, Map<number, Uint8Array>>;
  /** Comment ids claimed but not yet confirmed. */
  pending: Set<string>;
}

const bySeq = <T>(a: Sequenced<T>, b: Sequenced<T>) => a.seq - b.seq;
const done = <T>(value: T): Promise<T> => Promise.resolve(value);

/**
 * Shares in this server process's memory. Local development and e2e only:
 * every instance has its own, and a restart forgets them.
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
        blobs: new Map(),
        parts: new Map(),
        pending: new Set(),
      });
      return done(undefined);
    },
    byId: (id) => done(shares.get(id)?.record ?? null),
    byTokenHash: (tokenHash) =>
      done(
        [...shares.values()].find((entry) => entry.record.tokenHash === tokenHash)?.record ?? null,
      ),
    setProject(id, project, at) {
      const entry = shares.get(id);
      if (entry) entry.record = { ...entry.record, project, updatedAt: at };
      return done(undefined);
    },
    remove(id) {
      const entry = shares.get(id);
      shares.delete(id);
      return done([...(entry?.blobs.values() ?? [])].map((blob) => blob.location));
    },
    snapshots: (id) => done([...(shares.get(id)?.snapshots.values() ?? [])].sort(bySeq)),
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
      upsert(shares.get(id)?.comments, comment, origin);
      return done(undefined);
    },
    insertComment(id, comment, origin, options) {
      const entry = shares.get(id);
      if (!entry || entry.comments.has(comment.id)) return done(false);
      upsert(entry.comments, comment, origin);
      if (options?.pending) entry.pending.add(comment.id);
      return done(true);
    },
    confirmComment(id, commentId) {
      const entry = shares.get(id);
      const row = entry?.comments.get(commentId);
      if (entry?.pending.delete(commentId) && row) {
        entry.comments.set(commentId, { ...row, seq: (seq += 1) });
      }
      return done(undefined);
    },
    deleteSnapshots(id, ids) {
      for (const snapshotId of ids) shares.get(id)?.snapshots.delete(snapshotId);
      return done(undefined);
    },
    deleteComments(id, ids) {
      for (const commentId of ids) {
        shares.get(id)?.comments.delete(commentId);
        shares.get(id)?.pending.delete(commentId);
      }
      return done(undefined);
    },
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
