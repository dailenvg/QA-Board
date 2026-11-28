import type { ClientInfo } from "../client-info/schema";

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
   * from version 2, `page:<id>` on pages added since. A replaced picture gets a
   * fresh `page:<id>` key of its own, so this can differ from the page's id.
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
  /**
   * How many times the picture was replaced in place (missing means never).
   * A share keys the picture by it, so a replaced page is uploaded again.
   */
  rev?: number;
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
  /** How long clients can comment, in hours from `createdAt`: 24, 72 or 168; null for no limit. */
  reviewWindowHours: number | null;
  /** When clients can no longer comment (epoch ms), as the server counts it; null: never. */
  reviewEndsAt: number | null;
  /**
   * When the link's current password was set (epoch ms), while it asks guests
   * for one. The password itself never reaches the browser.
   */
  passwordSetAt?: number;
  /** Who the link is for, as its guests read it ("invited Acme Studio"); missing without a name. */
  clientName?: string;
  /** How many different people its invitation emails have gone to; missing before the first. */
  invitedCount?: number;
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
  /** A short tag the team gives it (one per project), for filtering. */
  label?: string;
  /** Where the team says it stands (056, `lib/store/stage.ts`); missing for no stage. */
  stage?: ProjectStage;
  /** When its stage last changed (epoch ms); set with `stage`. */
  stageChangedAt?: number;
  /**
   * Set while archived: out of the folder grids, counts and the Overview, its
   * review link closed, until it's unarchived or deleted for good at `deleteAfter`.
   */
  archivedAt?: number;
  /** When an archived project is deleted for good (epoch ms); set with `archivedAt`. */
  deleteAfter?: number;
}

/** Where a project stands, set by hand (056): With client, Editing, On hold or Approved. */
export type ProjectStage = "open-for-review" | "editing" | "on-hold" | "approved";

export type CommentStatus = "active" | "resolved";

/** How much a comment matters (055): Must fix, Should fix or Nit (`lib/store/priority.ts`). */
export type CommentPriority = "must" | "should" | "nit";

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
   * When its words last changed (epoch ms); missing while they never have.
   * Resolving, reopening or adding the crop doesn't count (`updatedAt` does).
   */
  editedAt?: number;
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
  /**
   * How much it matters (055); missing for none, where every comment starts.
   * Picked when posting (a guest's too, only then); any member changes it
   * later. Never an edit: `editedAt` stays. Pushed to the review link (D26).
   */
  priority?: CommentPriority;
  /**
   * Posted by a client on the project's review link (no account), then pulled
   * into the workspace. Missing on the team's own comments.
   */
  fromClient?: true;
  /**
   * Kept to the team (057): never on a review link, nor any reply under it.
   * Only the team's own comments; its author or the owner changes it. Never
   * pushed (`toShareState` leaves the comment out).
   */
  teamOnly?: true;
  /**
   * Written by the signed-in member (the server says so on every read; a new
   * comment is theirs). Only they edit it. Never pushed to a review link. On
   * a review link: posted from this browser, which holds its edit key (4.12).
   */
  mine?: true;
  /**
   * The author's photo, a versioned URL by a key that's never their id: in the
   * workspace for a team member's comment, on a review link for one the
   * server marks `team`. Missing without a photo, on a client's comment, and
   * once the author has left. Set by the server only; never pushed.
   */
  authorAvatar?: string;
  /**
   * On a review link: written by someone on the company's team (the server
   * says so, 4.11). The workspace tells its own by `fromClient` instead. Never pushed.
   */
  team?: true;
  /**
   * On a review link: a client's comment posted without its screenshot (the
   * server says so). The workspace tells by `fromClient` without `crop`
   * (`isScreenshotPending`). Never pushed.
   */
  screenshotPending?: true;
  /**
   * The browser it was posted from (052), for the team's "Get info": recorded
   * by the server from the post, a guest's read from the review link. Missing
   * on comments posted before Squint kept it. Team only: never pushed to a
   * review link (`toShareState`), never in a guest's view.
   */
  clientInfo?: ClientInfo;
}

/**
 * A reply in a comment's thread (053), oldest first under it. A reply never
 * reopens its comment, and replies don't count anywhere comments do (pins,
 * cards, waiting, Squiggy).
 */
export interface Reply {
  id: string;
  projectId: string;
  commentId: string;
  body: string;
  /** On a team reply, its author's name as it is now; on a client's, as posted. */
  author: string;
  createdAt: number;
  /** When its words last changed (epoch ms); missing while they never have. */
  editedAt?: number;
  /** Posted by a client on the project's review link, then pulled into the workspace. */
  fromClient?: true;
  /**
   * Kept to the team (057): never on a review link. A reply written while its
   * comment is team only is stored so for good, so showing the comment later
   * doesn't show it. Only the team's own. Never pushed.
   */
  teamOnly?: true;
  /** Written by the signed-in member (the server says so on every read). Only they edit it. */
  mine?: true;
  /** The author's photo, as on `Comment.authorAvatar`. Set by the server only; never pushed. */
  authorAvatar?: string;
  /** On a review link: written by someone on the company's team, as on `Comment.team`. Never pushed. */
  team?: true;
  /** The browser it was posted from, as on `Comment.clientInfo`. Team only: never pushed. */
  clientInfo?: ClientInfo;
}

/** A client's edit to their comment, pulled from its review link (4.12): new words, and when. */
export interface ClientEdit {
  id: string;
  body: string;
  editedAt: number;
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
  /**
   * Every comment's replies, flat, each naming its comment (`commentId`).
   * Only the workspace has them: data saved in a browser loads with none.
   */
  replies: Reply[];
  /** Added after version 1 shipped; saved data without it loads with none. */
  snapshots: Snapshot[];
  /** Name used for new comments; asked once, then remembered. */
  authorName: string | null;
}
