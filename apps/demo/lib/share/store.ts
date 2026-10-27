import type {
  BlobLocation,
  Origin,
  Sequenced,
  SharedComment,
  SharedProject,
  SharedSnapshot,
  ShareRecord,
  StoredBlob,
} from "./types";

/**
 * Persistence for shares. Implementations: in memory (local dev, e2e; one per
 * server instance) and Postgres (`DATABASE_URL`). Deleting a share removes its
 * snapshots, comments and blob rows; callers clean up remote blob files.
 */
export interface ShareStore {
  create(record: ShareRecord): Promise<void>;
  byId(id: string): Promise<ShareRecord | null>;
  byTokenHash(tokenHash: string): Promise<ShareRecord | null>;
  /** Replaces the project, and the share's deletion date (`expiresAt`) with it. */
  setProject(id: string, project: SharedProject, at: number, expiresAt: number): Promise<void>;
  /** Deletes the share and everything under it; returns where its blobs lived. */
  remove(id: string): Promise<BlobLocation[]>;
  /**
   * Shares whose `expiresAt` is at or before `now` (epoch ms), soonest first,
   * at most `limit`: what the daily expiry deletes.
   */
  expiredIds(now: number, limit: number): Promise<string[]>;

  /**
   * Confirmed snapshots and comments only: pending ones are invisible to every
   * read, except blob bookkeeping (`includePending`), so an image being stored
   * isn't swept.
   */
  snapshots(
    id: string,
    options?: { includePending: boolean },
  ): Promise<Sequenced<SharedSnapshot>[]>;
  comments(id: string, options?: { includePending: boolean }): Promise<Sequenced<SharedComment>[]>;
  /** Inserts, or replaces the data of an existing row (keeping its origin and seq). */
  upsertSnapshot(id: string, snapshot: SharedSnapshot, origin: Origin): Promise<void>;
  upsertComment(id: string, comment: SharedComment, origin: Origin): Promise<void>;
  /** Inserts a client's snapshot as pending: invisible until `confirmSnapshot`. */
  insertPendingSnapshot(id: string, snapshot: SharedSnapshot): Promise<void>;
  /**
   * Makes a pending snapshot visible, with a fresh seq so a pull can't skip it.
   * False when it's no longer pending (expired, or already confirmed).
   */
  confirmSnapshot(id: string, snapshotId: string): Promise<boolean>;
  /** Deletes pending snapshots created before `cutoff`. Returns the ids it deleted. */
  deleteStalePendingSnapshots(id: string, cutoff: number): Promise<string[]>;
  /**
   * Inserts only; false when the id is taken (by any row, pending or not).
   * With a `claim`, the row is pending: it claims the id but stays invisible
   * until that same claim confirms it, and records where its crop goes.
   */
  insertComment(
    id: string,
    comment: SharedComment,
    origin: Origin,
    claim?: { claim: string; cropKey: string },
  ): Promise<boolean>;
  /**
   * Makes the comment visible, with a fresh seq so a pull can't skip it, only
   * if it's still pending under `claim`. False when that claim no longer holds it.
   */
  confirmComment(id: string, commentId: string, claim: string): Promise<boolean>;
  /** Deletes the comment only if it's still pending under `claim`. */
  deleteClaim(id: string, commentId: string, claim: string): Promise<boolean>;
  /** When a still-pending comment was claimed (its `createdAt`), or null when it isn't pending. */
  pendingSince(id: string, commentId: string): Promise<number | null>;
  /**
   * Deletes pending comments claimed before `cutoff` (only `commentId`, when
   * given), atomically per row. Returns the ids it deleted.
   */
  deleteStalePending(id: string, cutoff: number, commentId?: string): Promise<string[]>;
  /** The crop key recorded on a visible comment, or null (then it's `crop:<id>`). */
  cropKeyOf(id: string, commentId: string): Promise<string | null>;
  deleteSnapshots(id: string, ids: readonly string[]): Promise<void>;
  deleteComments(id: string, ids: readonly string[]): Promise<void>;

  /** Keys and sizes of stored blobs, without their bytes. */
  blobSizes(id: string): Promise<Array<{ key: string; size: number }>>;
  getBlob(id: string, key: string): Promise<StoredBlob | null>;
  putBlob(id: string, blob: StoredBlob): Promise<void>;
  deleteBlobs(id: string, keys: readonly string[]): Promise<BlobLocation[]>;

  /** One part of an image uploaded in several requests. */
  putBlobPart(id: string, key: string, part: number, bytes: Uint8Array): Promise<void>;
  /** The parts received so far, in order. */
  blobParts(id: string, key: string): Promise<Array<{ part: number; bytes: Uint8Array }>>;
  deleteBlobParts(id: string, key: string): Promise<void>;
}
