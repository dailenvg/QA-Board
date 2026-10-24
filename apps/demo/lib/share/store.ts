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
  setProject(id: string, project: SharedProject, at: number): Promise<void>;
  /** Deletes the share and everything under it; returns where its blobs lived. */
  remove(id: string): Promise<BlobLocation[]>;

  snapshots(id: string): Promise<Sequenced<SharedSnapshot>[]>;
  /**
   * Confirmed comments only: pending ones are invisible to every read, except
   * blob bookkeeping (`includePending`), so a crop being stored isn't swept.
   */
  comments(id: string, options?: { includePending: boolean }): Promise<Sequenced<SharedComment>[]>;
  /** Inserts, or replaces the data of an existing row (keeping its origin and seq). */
  upsertSnapshot(id: string, snapshot: SharedSnapshot, origin: Origin): Promise<void>;
  upsertComment(id: string, comment: SharedComment, origin: Origin): Promise<void>;
  /**
   * Inserts only; false when the id is taken (by any row, pending or not). A
   * pending row claims the id but stays invisible until `confirmComment`.
   */
  insertComment(
    id: string,
    comment: SharedComment,
    origin: Origin,
    options?: { pending: boolean },
  ): Promise<boolean>;
  /** Makes a pending comment visible, with a fresh seq so a pull can't skip it. */
  confirmComment(id: string, commentId: string): Promise<void>;
  /** When a still-pending comment was claimed (its `createdAt`), or null when it isn't pending. */
  pendingSince(id: string, commentId: string): Promise<number | null>;
  /**
   * Deletes pending comments claimed before `cutoff` (only `commentId`, when
   * given), atomically per row. Returns the ids it deleted.
   */
  deleteStalePending(id: string, cutoff: number, commentId?: string): Promise<string[]>;
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
