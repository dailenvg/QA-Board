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
  snapshotId?: string;
  /** The page the pin is on: one of the project's pages (page projects, when not on a snapshot). */
  pageId?: string;
  /** The picture is the blob `crop:<id>`. */
  crop?: { rect: Rect };
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
}

export interface ShareRecord {
  id: string;
  /** SHA-256 of the share token (hex). The token itself is never stored. */
  tokenHash: string;
  ownerKeyHash: string;
  project: SharedProject;
  createdAt: number;
  updatedAt: number;
}

export type BlobLocation = { kind: "inline"; bytes: Uint8Array } | { kind: "vercel"; url: string };

export interface StoredBlob {
  key: string;
  contentType: string;
  size: number;
  location: BlobLocation;
}

/** What a client sees: the share without its secrets or bookkeeping. */
export interface ClientView {
  project: SharedProject;
  snapshots: SharedSnapshot[];
  comments: SharedComment[];
  /** When the review window closes (epoch ms): after it, clients can only read. */
  reviewEndsAt: number;
}

/** The owner's pull: client additions after `since`, and the new cursor. */
export interface ShareChanges {
  snapshots: SharedSnapshot[];
  comments: SharedComment[];
  cursor: number;
}

/** The owner's answer to creating a share. Token and owner key are shown this once. */
export interface CreatedShare {
  shareId: string;
  /** The client link's secret; only its hash is stored. */
  token: string;
  /** The owner's secret for every owner route; only its hash is stored. */
  ownerKey: string;
  missingBlobs: string[];
}

/** What the server holds, by content digest, so the owner can send only what changed. */
export interface ShareManifest {
  project: string;
  snapshots: Array<{ id: string; digest: string }>;
  comments: Array<{ id: string; digest: string }>;
  missingBlobs: string[];
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
