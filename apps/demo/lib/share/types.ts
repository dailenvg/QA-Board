import type { ClientInfo } from "../client-info/schema";
import type { CommentStatus, PageOrigin, Rect } from "../store/types";

/** A page of a shared page project. Its picture is the blob `pageBlobKey(id, rev)`. */
export interface SharedPage {
  /** Unique within the share. */
  id: string;
  name: string;
  /** Natural size in px, when the owner's browser knows it. */
  width?: number;
  height?: number;
  /** Times the picture was replaced; missing means never. */
  rev?: number;
}

/**
 * What a share holds, as it travels between browsers and the server. Times
 * are epoch ms, like the local store. Images are addressed by blob key:
 * `page:<pageId>` (`page:<pageId>:<rev>` once replaced), `snapshot:<id>`, `crop:<commentId>`.
 */
export type SharedSource =
  | { kind: "url"; url: string }
  | {
      kind: "pages";
      origin: PageOrigin;
      fileName: string;
      referenceUrl?: string;
      pages: SharedPage[];
    };

export interface SharedProject {
  name: string;
  source: SharedSource;
  /** When the owner created the project; the share is deleted 30 days later (see `retention.ts`). */
  createdAt?: number;
}

export interface SharedSnapshot {
  id: string;
  width: number;
  height: number;
  createdAt: number;
  sourceUrl: string;
  /** Image px per page px when the capture was rendered smaller; missing means 1. */
  scale?: number;
}

/**
 * A client's new snapshot as their capture answers it. `partial`: only the
 * top of a long page was captured in time. Said once, never stored.
 */
export interface CapturedSnapshot extends SharedSnapshot {
  partial?: true;
}

export interface SharedComment {
  id: string;
  x: number;
  y: number;
  body: string;
  author: string;
  status: CommentStatus;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  /**
   * When its words last changed after posting (epoch ms): the client's own
   * edit (4.12) on a client's comment, the author's on a team one.
   */
  editedAt?: number;
  snapshotId?: string;
  /** The page the pin is on: one of the project's pages (page projects, when not on a snapshot). */
  pageId?: string;
  /** The picture is the blob `crop:<id>`. */
  crop?: { rect: Rect };
}

/**
 * A comment as a guest reads it: a team member's (one of the workspace's own,
 * pushed to the link) says so, with their avatar on this link when they have
 * one (4.11). Nothing of it is stored in the share, and a push never sets it.
 */
export interface ClientComment extends SharedComment {
  /** Their avatar (`/api/s/<token>/people/<key>/avatar?v=`); missing without one, or once they've left. */
  authorAvatar?: string;
  /** Written by someone on the company's team; missing on a client's. */
  team?: true;
  /**
   * A client's comment posted without its screenshot (every try to render or
   * upload it failed). Read from the comment itself, a client's with no crop;
   * there's no way to add one later.
   */
  screenshotPending?: true;
}

/** A team member's avatar on one link: their key and its version there (`share-people.ts`). */
export interface TeamAvatar {
  key: string;
  version: string;
}

/** Everything the owner controls, pushed whole on every change. */
export interface ShareState {
  project: SharedProject;
  snapshots: SharedSnapshot[];
  comments: SharedComment[];
}

/** Who added a snapshot or comment. Client additions are what the owner pulls. */
export type Origin = "owner" | "client";

export interface Sequenced<T> {
  item: T;
  origin: Origin;
  /** Increases with every insert across the share; the owner's pull cursor. */
  seq: number;
  /**
   * Comments only: where a client comment's crop is stored (`crop:<id>:<claim>`).
   * Missing for owner and older rows, whose crop is `crop:<id>`. Server-side only.
   */
  cropKey?: string;
  /**
   * Comments only: from the same sequence as `seq`, taken by the client's
   * latest edit (045); missing while it has none. The owner's pull finds
   * edits by it. Server-side only.
   */
  editSeq?: number;
  /**
   * Comments only: the browser a client posted from (052), kept beside the
   * comment, never in it (`item`), so the manifest's digest and the guest's
   * view never have it. Only the owner's pull carries it.
   */
  clientInfo?: ClientInfo;
}

export interface ShareRecord {
  id: string;
  /** SHA-256 of the share token (hex). The token itself is never stored. */
  tokenHash: string;
  ownerKeyHash: string;
  project: SharedProject;
  createdAt: number;
  updatedAt: number;
  /**
   * When the share is deleted for good (epoch ms): `shareExpiresAt(project,
   * createdAt)`, held back by `rescheduledExpiry` when a push moves it sooner.
   * From then on it answers like a revoked share. Null on a workspace's share
   * (migration 022), which never expires on its own.
   */
  expiresAt: number | null;
  /**
   * How long clients can add to it, in hours from `createdAt` (035): 24, 72
   * or 168; null for no limit. Only a workspace's link is ever set off the 72-hour default.
   */
  reviewWindowHours: number | null;
  /**
   * The link's password (036), or null when it's open. Only a workspace's link
   * ever has one. Server-side only: never sent to an owner or a guest.
   */
  password: SharePassword | null;
  /**
   * Who the link is for, as its owner names them (038): "{Company} has invited
   * {Client} to review". Null without a name. Only a workspace's link has one.
   */
  clientName: string | null;
  /**
   * The workspace whose project's review link it is (022), set once attached;
   * missing on an anonymous share. Then its owner routes also need the
   * session's membership of it (`asOwner`). Server-side only.
   */
  workspaceId?: string;
}

/** A review link's password as stored: its Argon2id hash, and when it was set (epoch ms). */
export interface SharePassword {
  hash: string;
  setAt: number;
}

export type BlobLocation = { kind: "inline"; bytes: Uint8Array } | { kind: "vercel"; url: string };

export interface StoredBlob {
  key: string;
  contentType: string;
  size: number;
  location: BlobLocation;
}

/**
 * The company behind a share, as its guest sees it: a name, an accent and
 * whether there's a logo (read through `/api/s/<token>/brand/logo`). Never an
 * id, a storage key or a path: the token is the guest's only identifier.
 */
export interface ClientBrand {
  /** False on an anonymous share: Squint's own name and look, and the generic copy. */
  custom: boolean;
  name: string;
  /**
   * `#rrggbb`, for accents only (a rule, a frame, the default mark's bubble), never
   * behind text; the mark's icon takes the ink that reads on it. Null keeps the app's own.
   */
  color: string | null;
  hasLogo: boolean;
  /** Changes with the logo, so its URL (`?v=`) does too; null without a logo. */
  logoVersion: string | null;
  /**
   * The company icon's `?v=` (`brandIconVersion`): changes with the name, color
   * or logo. The badge on the team's avatars reads the icon at it (`shareIconSrc`).
   */
  iconVersion: string;
}

/**
 * A password-protected link before it's unlocked: whose it is, and the
 * project's name for its invitation. Nothing else of the project (no source,
 * pages, snapshots or comments).
 */
export interface LockedShare {
  brand: ClientBrand;
  projectName: string;
  /** Who the link is for (its invitation names them); null: "invited you". */
  clientName: string | null;
}

/** What a client sees: the share without its secrets or bookkeeping. */
export interface ClientView {
  project: SharedProject;
  brand: ClientBrand;
  /** Who the link is for (its invitation names them); null: "invited you". */
  clientName: string | null;
  snapshots: SharedSnapshot[];
  comments: ClientComment[];
  /** When the review window closes (epoch ms): after it, clients can only read. Null: never. */
  reviewEndsAt: number | null;
  /** How long the review window is, in hours from the link's creation; null for no limit. */
  reviewWindowHours: number | null;
  /** When the share is deleted for good (epoch ms); null when it never expires on its own. */
  expiresAt: number | null;
}

/**
 * A client's comment as the owner pulls it: `edited` when the owner pulled it
 * before and the client has changed its words since (4.12). Then only its
 * `body` and `editedAt` are news.
 */
export interface PulledComment extends SharedComment {
  edited?: true;
  /** The browser it was posted from, when the link recorded it (052). Team only. */
  clientInfo?: ClientInfo;
}

/** The owner's pull: client additions and edits after `since`, and the new cursor. */
export interface ShareChanges {
  snapshots: SharedSnapshot[];
  comments: PulledComment[];
  cursor: number;
  /** When the share is deleted for good (epoch ms); null when it never expires on its own. */
  expiresAt: number | null;
}

/**
 * What a client gets back for a new comment: the comment, and the key that
 * lets this browser edit its words (4.12). Only the key's hash is stored, so
 * this answer is the one time it's ever sent.
 */
export interface PostedComment extends SharedComment {
  editKey: string;
}

/** Why a client's edit wasn't saved: no such comment for that key, or no longer active. */
export type ClientEditRefusal = "missing" | "locked";

/** A client comment resolved (with `resolvedAt`) or reopened (null) in the workspace, and when. */
export interface ClientStatusChange {
  status: CommentStatus;
  resolvedAt: number | null;
  updatedAt: number;
}

/** The owner's answer to creating a share. Token and owner key are shown this once. */
export interface CreatedShare {
  shareId: string;
  /** The client link's secret; only its hash is stored. */
  token: string;
  /** The owner's secret for every owner route; only its hash is stored. */
  ownerKey: string;
  missingBlobs: string[];
  /** When the server created it (epoch ms): the review window counts from here. */
  createdAt: number;
  /** When the share is deleted for good (epoch ms). */
  expiresAt: number;
}

/** What the server holds, by content digest, so the owner can send only what changed. */
export interface ShareManifest {
  project: string;
  snapshots: Array<{ id: string; digest: string }>;
  comments: Array<{ id: string; digest: string }>;
  missingBlobs: string[];
  /** When the share is deleted for good (epoch ms); null when it never expires on its own. */
  expiresAt: number | null;
}

/** One batch of owner changes (see `changeSchema`). */
export interface ShareChange {
  project?: SharedProject;
  snapshots: SharedSnapshot[];
  comments: SharedComment[];
  deleteSnapshots: string[];
  deleteComments: string[];
  cursor: number;
}
