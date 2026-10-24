import type { CommentStatus, Rect } from "../store/types";

/**
 * What a share holds, as it travels between browsers and the server. Times
 * are epoch ms, like the local store. Images are addressed by blob key:
 * `image` (an image project's picture), `snapshot:<id>`, `crop:<commentId>`.
 */
export type SharedSource =
  { kind: "url"; url: string } | { kind: "image"; fileName: string; referenceUrl?: string };

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
