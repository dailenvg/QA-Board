export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  /** The folder it sits in; null at the top level. */
  parentId: string | null;
}

/**
 * One picture of a page-based project. Comments on it carry its id, and their
 * pins and crops are in its px.
 */
export interface Page {
  /**
   * Unique within its project only: a project's single page migrated from
   * version 2 has the id `MIGRATED_PAGE_ID` (see `persist.ts`), the same in
   * every project. Never use a page id as a key outside its project.
   */
  id: string;
  /**
   * Key of the picture in the blob store: `image:<projectId>` on pages migrated
   * from version 2, `page:<pageId>` on pages added since.
   */
  blobKey: string;
  /** Shown to reviewers and in exports: the image's file name, or "Page 3" of a PDF. */
  name: string;
  /**
   * Natural size of the stored picture in px. Missing on pages migrated from
   * version 2, which never recorded it; read it from the image when needed.
   */
  width?: number;
  height?: number;
}

/** What a page-based project was made from. */
export type PageOrigin = "image" | "pdf";

/** A page-based project's source. Always at least one page, in reading order. */
export interface PagesSource {
  kind: "pages";
  origin: PageOrigin;
  pages: Page[];
  /** The uploaded file (the first one, for images combined into one project). */
  fileName: string;
  /** The original site, when a screenshot replaced a website project. */
  referenceUrl?: string;
}

export type ProjectSource = { kind: "url"; url: string } | PagesSource;

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

/** A region in surface pixels: a snapshot's page px, or a page's natural px. */
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
  /** The region shown, in surface px (the snapshot's page px, or the page's natural px). */
  rect: Rect;
}

export interface Comment {
  id: string;
  projectId: string;
  /**
   * Pin position as a percentage (0 to 100) of the surface: the snapshot when
   * `snapshotId` is set, the page when `pageId` is set, else (older website
   * comments) the visible frame.
   */
  x: number;
  y: number;
  body: string;
  author: string;
  status: CommentStatus;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  /**
   * The snapshot the pin was placed on. A comment sits on one surface: a
   * snapshot (`snapshotId`), a page (`pageId`), or, with neither, the live
   * frame of a website project (older comments only).
   */
  snapshotId?: string;
  /** The page the pin was placed on: set on every page-project comment that isn't on a snapshot. */
  pageId?: string;
  /** Added shortly after the comment is posted, once the picture is saved. */
  crop?: CommentCrop;
}

/**
 * A deleted project's share, still to be revoked on the server. Kept until
 * the server confirms, so a failed revoke is retried on the next load.
 */
export interface PendingRevocation {
  shareId: string;
  ownerKey: string;
  /** The deleted project; an Undo cancels this. */
  projectId: string;
  /** When the delete is final: when its Undo is no longer offered (or a fallback a minute later). */
  dueAt: number;
}

export interface SquintData {
  /**
   * 3 since image projects hold pages and folders nest. Version 2 (images in
   * the blob store) and version 1 (images inline) are migrated on load.
   */
  version: 3;
  folders: Folder[];
  projects: Project[];
  comments: Comment[];
  /** Added after version 1 shipped; saved data without it loads with none. */
  snapshots: Snapshot[];
  /** Shares of deleted projects still to revoke. Missing in older data. */
  revocations: PendingRevocation[];
  /** Name used for new comments; asked once, then remembered. */
  authorName: string | null;
}
