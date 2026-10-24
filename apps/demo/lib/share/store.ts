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
  comments(id: string): Promise<Sequenced<SharedComment>[]>;
  /** Inserts, or replaces the data of an existing row (keeping its origin and seq). */
  upsertSnapshot(id: string, snapshot: SharedSnapshot, origin: Origin): Promise<void>;
  upsertComment(id: string, comment: SharedComment, origin: Origin): Promise<void>;
  /** Inserts only; false when the id is taken. */
  insertComment(id: string, comment: SharedComment, origin: Origin): Promise<boolean>;
  deleteSnapshots(id: string, ids: readonly string[]): Promise<void>;
  deleteComments(id: string, ids: readonly string[]): Promise<void>;

  /** Keys and sizes of stored blobs, without their bytes. */
  blobSizes(id: string): Promise<Array<{ key: string; size: number }>>;
  getBlob(id: string, key: string): Promise<StoredBlob | null>;
  putBlob(id: string, blob: StoredBlob): Promise<void>;
  deleteBlobs(id: string, keys: readonly string[]): Promise<BlobLocation[]>;
}
