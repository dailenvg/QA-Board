import type { ClientInfo } from "../client-info/schema";
import type { ShareBrand } from "./brand";
import type {
  BlobLocation,
  ClientEditRefusal,
  ClientReplyOutcome,
  ClientStatusChange,
  Origin,
  Sequenced,
  SharedComment,
  SharedProject,
  SharedReply,
  SharedSnapshot,
  ShareRecord,
  StoredBlob,
  TeamAvatar,
  TeamOnlyIds,
} from "./types";

/**
 * Persistence for shares. Implementations: in memory (local dev, e2e; one per
 * server instance) and Postgres (`DATABASE_URL`). Deleting a share removes its
 * snapshots, comments, replies and blob rows; callers clean up remote blob
 * files. Deleting a comment, by any means, removes its replies.
 */
export interface ShareStore {
  create(record: ShareRecord): Promise<void>;
  byId(id: string): Promise<ShareRecord | null>;
  byTokenHash(tokenHash: string): Promise<ShareRecord | null>;
  /**
   * The share behind `tokenHash` while it's paused: it would answer but for its
   * workspace's suspension by the Squint admin. Null otherwise, and always in
   * the memory store, which has no workspaces. Only to tell a guest the review
   * isn't available right now; never to serve it.
   */
  pausedByTokenHash(tokenHash: string): Promise<ShareRecord | null>;
  /**
   * Whether the share's row is still there, open or not: unlike `byId`, it
   * counts a share closed with its project or workspace (in the trash,
   * archived, waiting to be deleted), which opens again when that's undone.
   * For cleanup that must keep such a share's files; never to serve it.
   */
  exists(id: string): Promise<boolean>;
  /**
   * Replaces the project, and the share's deletion date (`expiresAt`) with it.
   * A workspace's share keeps none (null), whatever `expiresAt` says.
   */
  setProject(
    id: string,
    project: SharedProject,
    at: number,
    expiresAt: number | null,
  ): Promise<void>;
  /** Deletes the share and everything under it; returns where its blobs lived. */
  remove(id: string): Promise<BlobLocation[]>;
  /**
   * Shares whose `expiresAt` is at or before `now` (epoch ms), soonest first,
   * at most `limit`: what the daily expiry deletes. Anonymous shares only:
   * shares made from a workspace (migration 022) never expire on their own.
   */
  expiredIds(now: number, limit: number): Promise<string[]>;
  /**
   * The brand of the share's workspace: its name, color and logo key (when
   * that file is stored). `SQUINT_BRAND` for an anonymous share, an unknown
   * one, or one closed like `byId` (its project in the trash, its workspace
   * archived or waiting to be deleted).
   */
  brandOf(id: string): Promise<ShareBrand>;
  /** The logo file of the share's workspace, under the same rules as `brandOf`; null without one. */
  brandLogo(id: string): Promise<StoredBlob | null>;
  /**
   * The team behind the share's comments (4.11), by comment id: each comment
   * the owner pushed that a member wrote in the workspace (the workspace's
   * comment with the same id is a team one), with the author's avatar on this
   * link, or null without one: no photo, or an author who has left (removed,
   * or their account deleted). Client comments, even pushed back from an older
   * link, aren't in it. Empty under the same rules as `brandOf`, and always
   * in the memory store, which has no workspaces.
   */
  teamAuthors(id: string): Promise<Map<string, TeamAvatar | null>>;
  /**
   * `teamAuthors` for replies, by reply id: each reply the owner pushed whose
   * workspace reply (same project, same id) is a team one, under the same rules.
   */
  teamReplyAuthors(id: string): Promise<Map<string, TeamAvatar | null>>;
  /**
   * The avatar of the active member of the share's workspace whose key on
   * this link is `key` (`sharePersonKey`), with its version on this link
   * (`shareAvatarVersion`). Null for a key no active member has here (another
   * link's, a removed member's), without a photo, under the same rules as
   * `brandOf`, and always in the memory store.
   */
  teamAvatar(id: string, key: string): Promise<{ blob: StoredBlob; version: string } | null>;

  /**
   * Confirmed snapshots and comments only: pending ones are invisible to every
   * read, except blob bookkeeping (`includePending`), so an image being stored
   * isn't swept.
   */
  snapshots(
    id: string,
    options?: { includePending: boolean },
  ): Promise<Sequenced<SharedSnapshot>[]>;
  /**
   * With each row's `editSeq` once a client has edited it, and the browser a
   * client posted from (`clientInfo`); never its edit key's hash.
   */
  comments(id: string, options?: { includePending: boolean }): Promise<Sequenced<SharedComment>[]>;
  /** Inserts, or replaces the data of an existing row (keeping its origin and seq). */
  upsertSnapshot(id: string, snapshot: SharedSnapshot, origin: Origin): Promise<void>;
  /**
   * Inserts, or changes an existing row, keeping its origin and seq: an
   * owner's row takes `comment` whole; a client's only takes its `pageId`
   * (when it has one), since its words change only by the client's edit and
   * its status only on the server's resolve (4.12). So a tab that hasn't
   * pulled can't put old words back, reopen a resolved comment or resolve one.
   */
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
   * `clientInfo` is kept beside the comment (052), for the owner's pull only.
   */
  insertComment(
    id: string,
    comment: SharedComment,
    origin: Origin,
    claim?: { claim: string; cropKey: string },
    editKeyHash?: string,
    clientInfo?: ClientInfo,
  ): Promise<boolean>;
  /**
   * A client's edit of their visible comment's words, in one step (4.12):
   * only with the hash of the key it was posted with (`editKeyHash`, checked
   * in constant time) and only while it's active. Sets `body`, `editedAt` and
   * `updatedAt` (`now`), and a fresh `editSeq`. Answers the comment as it is
   * now, `missing` (no such comment, another origin, no key or another key)
   * or `locked` (the right key, but no longer active).
   */
  editClientComment(
    id: string,
    commentId: string,
    editKeyHash: string,
    body: string,
    now: number,
  ): Promise<SharedComment | ClientEditRefusal>;
  /**
   * Resolves (`resolvedAt` set) or reopens (none) a client's visible comment
   * right away, as the workspace did, with its times there (so the owner's
   * copy matches and isn't pushed again): the lock on its edits (4.12).
   * False when there's no such client comment.
   */
  setClientCommentStatus(
    id: string,
    commentId: string,
    change: ClientStatusChange,
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
  /**
   * Where a visible comment's crop is stored: the key its claim recorded, else
   * `crop:<id>` (the owner's, and older rows). Null while no visible comment
   * of that id has a crop, so a crop is never served without its comment (A42).
   */
  cropKeyOf(id: string, commentId: string): Promise<string | null>;
  deleteSnapshots(id: string, ids: readonly string[]): Promise<void>;
  deleteComments(id: string, ids: readonly string[]): Promise<void>;

  /** Every reply, in seq order, with the browser a client posted from (`clientInfo`). */
  replies(id: string): Promise<Sequenced<SharedReply>[]>;
  /**
   * The owner's reply: inserted under its comment, or replacing an owner
   * row's data (keeping its seq). A client's row with that id is left as it
   * is, and so is a reply that would move to another comment. Nothing while
   * the comment isn't visible on the link (deleted as it goes in included): a
   * reply never outlives it.
   */
  upsertReply(id: string, reply: SharedReply): Promise<void>;
  /**
   * A client's reply, inserted in one step only under a visible, active
   * comment while the link holds fewer than `caps.link` replies and the
   * comment's thread fewer than `caps.comment` (both counting the team's and
   * clients'). Never replaces a row. `clientInfo` is kept beside the reply,
   * for the owner's pull only. A comment deleted while the reply goes in
   * leaves it `missing`.
   */
  addClientReply(
    id: string,
    reply: SharedReply,
    caps: { link: number; comment: number },
    clientInfo?: ClientInfo,
  ): Promise<ClientReplyOutcome>;
  deleteReplies(id: string, ids: readonly string[]): Promise<void>;

  /**
   * Runs `run` in one transaction holding the share's lock (`lockShare`), with
   * a store bound to it. Postgres only: the memory store just runs it.
   */
  withShareLock<T>(id: string, run: (locked: ShareStore) => Promise<T>): Promise<T>;
  /**
   * What the share's project keeps to its team (057), by id: its team-only
   * comments, and every reply that's team only or under one. Read under
   * `withShareLock` so a team-only change can't slip in between. Empty for a
   * share with no project, and always in the memory store.
   */
  teamOnlyIds(id: string): Promise<TeamOnlyIds>;

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
