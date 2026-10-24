export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export type ProjectSource =
  | { kind: "url"; url: string }
  /**
   * The picture lives in the blob store under `blobKey` (`image:<projectId>`).
   * `referenceUrl` keeps the original site when a screenshot replaced a URL.
   */
  | { kind: "image"; blobKey: string; fileName: string; referenceUrl?: string };

/** The owner's side of a shared review link. Secrets stay in this browser. */
export interface ProjectShare {
  /** Server id of the share (not secret). */
  id: string;
  /** The client link's secret, kept so the owner can copy the link again. */
  token: string;
  /** The owner's secret for pushing, pulling and revoking. */
  ownerKey: string;
  createdAt: number;
  /** Client additions up to here have been pulled into this browser. */
  cursor: number;
  lastSyncedAt?: number;
}

export interface Project {
  id: string;
  folderId: string;
  name: string;
  source: ProjectSource;
  createdAt: number;
  updatedAt: number;
  /** Set while the project is shared with clients. */
  share?: ProjectShare;
}

export type CommentStatus = "active" | "resolved";

/** A region in surface pixels: snapshot page px, or an image's natural px. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A full-page capture of a website project, taken server-side. Comments made on
 * it keep pointing at it, so newer snapshots never move older pins.
 */
export interface Snapshot {
  id: string;
  projectId: string;
  /** Page width in CSS px the page was laid out at (device scale factor 1). */
  width: number;
  /** Captured page height in CSS px (capped server-side). */
  height: number;
  createdAt: number;
  /** Key of the image in the blob store (`lib/blob-store`). */
  blobKey: string;
  /** The address that was captured. */
  sourceUrl: string;
  /**
   * Image px per page px, when a very large page was rendered smaller to keep
   * the image under the capture size limit. Missing means 1.
   */
  scale?: number;
}

/** What the commenter was looking at when they posted: a picture of the stage with the pin on it. */
export interface CommentCrop {
  /** Key of the PNG in the blob store. */
  blobKey: string;
  /** The region shown, in surface px (the snapshot's page px, or the image's natural px). */
  rect: Rect;
}

export interface Comment {
  id: string;
  projectId: string;
  /**
   * Pin position as a percentage (0 to 100) of the surface: the snapshot when
   * `snapshotId` is set, else the image, else (older website comments) the visible frame.
   */
  x: number;
  y: number;
  body: string;
  author: string;
  status: CommentStatus;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  /** The snapshot the pin was placed on. Missing on image comments and older website comments. */
  snapshotId?: string;
  /** Added shortly after the comment is posted, once the picture is saved. */
  crop?: CommentCrop;
}

export interface SquintData {
  /** 2 since images moved out of localStorage; version 1 data is migrated on load. */
  version: 2;
  folders: Folder[];
  projects: Project[];
  comments: Comment[];
  /** Added after version 1 shipped; saved data without it loads with none. */
  snapshots: Snapshot[];
  /** Name used for new comments; asked once, then remembered. */
  authorName: string | null;
}
