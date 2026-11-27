import type { MembershipRole } from "../auth/memberships";
import type { MemberSwitch } from "../auth/permissions";
import type { Comment, Folder, ProjectSource, ProjectStage, Reply, Snapshot } from "../store/types";

/**
 * What the workspace API sends and takes. The shapes are the browser store's
 * (`lib/store/types.ts`), times in epoch ms, blob keys logical (`page:<id>`):
 * a file's storage path never leaves the server.
 */

/** How long a link's clients can comment, as the server keeps and counts it. */
export interface ReviewWindowState {
  /** Hours from the link's creation (24, 72 or 168); null for no limit. */
  reviewWindowHours: number | null;
  /** When the window closes (epoch ms, from the server's creation time); null: never. */
  reviewEndsAt: number | null;
}

/** A link's settings as `PATCH .../share-link/settings` answers them. */
export interface ShareSettingsState extends ReviewWindowState {
  /** Who the link is for, as its guests read it; null without a name. */
  clientName: string | null;
}

/**
 * A project's review link, without its secrets (those come from `share-link`
 * alone), with whether it asks guests for a password.
 */
export interface WorkspaceShareSummary extends ShareSettingsState, SharePasswordState {
  id: string;
  createdAt: number;
  cursor: number;
  lastSyncedAt?: number;
  /** How many different people its invitation emails have gone to (038). */
  invitedCount: number;
}

export interface WorkspaceProject {
  id: string;
  /**
   * Null at the workspace root: only a project whose folder was deleted while
   * it was in the trash, and restored since (the browser store files it).
   */
  folderId: string | null;
  name: string;
  source: ProjectSource;
  createdAt: number;
  updatedAt: number;
  label: string | null;
  /** Where the team says it stands (056); null for no stage. */
  stage: ProjectStage | null;
  /** When its stage last changed; null before the first change. */
  stageChangedAt: number | null;
  archivedAt: number | null;
  /** When an archived project is due to be deleted for good; null unless archived. */
  deleteAfter: number | null;
  share?: WorkspaceShareSummary;
}

/** A project in the trash, until the cron deletes it for good. */
export interface TrashedProject extends WorkspaceProject {
  deletedAt: number;
}

/** Whether a workspace link asks guests for a password. The password and its hash never leave the server. */
export interface SharePasswordState {
  hasPassword: boolean;
  /** When the current password was set (epoch ms); null without one. */
  passwordSetAt: number | null;
}

/** A link as `GET .../share-link` answers it: with whether it has a password. */
export type OwnerShareLink = ShareLink & SharePasswordState;

/** The owner's side of a project's review link, as the browser store's `ProjectShare`. */
export interface ShareLink extends ReviewWindowState {
  id: string;
  token: string;
  ownerKey: string;
  createdAt: number;
  cursor: number;
  lastSyncedAt?: number;
}

export interface StorageSummary {
  bytes: number;
  blobCount: number;
  quotaBytes: number;
}

/**
 * Clients' comments on one live project: those pulled into the workspace
 * (`Comment.fromClient`) and those still waiting on its review link.
 */
export interface ClientCommentActivity {
  projectId: string;
  /** Open client comments, pulled or still waiting on the review link. */
  open: number;
  /** When the newest client comment (open or resolved) or reply was posted (epoch ms). */
  latestAt: number;
  /**
   * When each open comment still waiting on the review link was posted,
   * newest first: not pulled yet, so it isn't in `comments`.
   */
  waiting: number[];
  /** The link's pull position `waiting` was read at (0 without a link): a later pull has them. */
  cursor: number;
}

/** The workspace as its guests meet it, besides its id and slug. */
export interface WorkspaceIdentity {
  id: string;
  slug: string;
  /** The company guests see. */
  name: string;
  /** Who its emails come from (`from_email_name`); null uses `name`. */
  fromEmailName: string | null;
  /** Its brand color (`#rrggbb`); null keeps Squint's own. */
  brandColor: string | null;
  /** Whether it has a logo: the company badge shows its icon then, else the default badge. */
  hasLogo: boolean;
  /**
   * Its company icon's `?v=` (`iconVersionOf`), changing with its name, color
   * or logo: the badge on the team's avatars reads the icon at it (`workspaceIconSrc`).
   */
  iconVersion: string;
}

/**
 * The signed-in member's place in the workspace (`can` reads it), so the
 * browser hides what the server would refuse, and names who to ask.
 */
export interface WorkspaceAccess {
  role: MembershipRole;
  /** The owner's switches for this member (041); the owner's own are never read. */
  permissions: MemberSwitch[];
  /** The owner's name, for "Ask {Owner}"; null until they give one. */
  ownerName: string | null;
  /**
   * The member's own photo, as their comments carry it (`personAvatarSrc`, by
   * their key here), so a comment they've just posted shows it at once; null
   * without one.
   */
  avatarSrc: string | null;
}

/** The workspace as its guests meet it, and as the signed-in member may work in it. */
export interface SignedInWorkspace extends WorkspaceIdentity, WorkspaceAccess {}

/** Everything a signed-in browser needs to show a workspace. */
export interface WorkspaceData {
  workspace: SignedInWorkspace;
  folders: Folder[];
  projects: WorkspaceProject[];
  snapshots: Snapshot[];
  comments: Comment[];
  /** Every comment's replies, oldest first. */
  replies: Reply[];
  /** Projects with any client comment, for the Overview. */
  clientActivity: ClientCommentActivity[];
  storage: StorageSummary;
  /** The signed-in user's name for new comments; null until they give one. */
  authorName: string | null;
}

/**
 * What a signed-in page starts from: the workspace, and its projects' review
 * links with their secrets (the member's own, as `share-link` answers them).
 */
export interface WorkspaceStart {
  data: WorkspaceData;
  links: ShareLink[];
}
