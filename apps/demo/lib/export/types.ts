import type { ClientInfo } from "../client-info/schema";
import type { CommentPriority, CommentStatus, PageOrigin, Rect } from "../store/types";

/** What a pin's percentages are relative to. */
export type ExportSurface = "snapshot" | "page" | "frame";

/** Why a snapshot or page image isn't in the ZIP. */
export type OmittedReason = "too-large" | "unavailable";

/** Which page a pin is on: its 1-based number in reading order, and its name. */
export interface ExportPageRef {
  id: string;
  number: number;
  name: string;
}

export interface ExportLocation {
  surface: ExportSurface;
  snapshotId: string | null;
  /** Set when `surface` is "page". */
  page: ExportPageRef | null;
  xPercent: number;
  yPercent: number;
  /** Snapshot page px or page px; null on the live frame, or a page whose size isn't known. */
  x: number | null;
  y: number | null;
  surfaceWidth: number | null;
  surfaceHeight: number | null;
}

/** A reply in a comment's thread, as exported: oldest first under its comment. */
export interface ExportReply {
  id: string;
  author: string;
  body: string;
  createdAt: number;
  /** When its words last changed; null while they never have. */
  editedAt: number | null;
  /** Posted by a client on the review link. */
  fromClient: boolean;
  /** Kept to the team (057): written as team only, or under a team-only comment. Team exports only. */
  teamOnly: boolean;
  /** The browser it was posted from, as recorded; null when not. In the JSON only, as a comment's. */
  clientInfo: ClientInfo | null;
}

export interface ExportComment {
  /** Its number within its own sequence (D13): 1..n for clients' comments, 1..n for team-only ones. */
  number: number;
  /** What its pin shows: "4", or "T1" for a team-only comment. */
  label: string;
  /** Kept to the team (057). Team exports only: one for a client leaves these out. */
  teamOnly: boolean;
  id: string;
  status: CommentStatus;
  /** Must fix, Should fix or Nit (055); null for none. */
  priority: CommentPriority | null;
  author: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
  location: ExportLocation;
  pageUrl: string | null;
  /** The crop, when this browser still has it; `file` is its path in the ZIP. */
  screenshot: { file: string; rect: Rect } | null;
  /**
   * The browser it was posted from, as recorded (052); null for comments from
   * before. In the JSON only: the Markdown is for reading, not debugging.
   */
  clientInfo: ClientInfo | null;
  /** Its thread, oldest first; empty without replies. */
  replies: ExportReply[];
}

export interface ExportSnapshot {
  id: string;
  width: number;
  height: number;
  createdAt: number;
  sourceUrl: string;
  file: string | null;
  omitted: OmittedReason | null;
}

/** A page of a page project, with its image in the ZIP (`file`) or why it was left out. */
export interface ExportPage extends ExportPageRef {
  width: number | null;
  height: number | null;
  file: string | null;
  omitted: OmittedReason | null;
}

export type ExportSource =
  | { kind: "url"; url: string }
  | {
      kind: "pages";
      origin: PageOrigin;
      fileName: string;
      referenceUrl: string | null;
      /** Every page, in reading order. */
      pages: ExportPage[];
    };

/** Everything an export says, before it's written as Markdown or JSON. */
/**
 * Who an export is for (D14): the team gets every comment and reply, team-only ones marked; a
 * client gets only what the review link shows, without anyone's browser details.
 */
export type ExportAudience = "team" | "client";

export interface ExportDocument {
  audience: ExportAudience;
  exportedAt: number;
  project: { id: string; name: string; source: ExportSource; createdAt: number; updatedAt: number };
  /** Only the snapshots that exported comments sit on, oldest first. */
  snapshots: ExportSnapshot[];
  /** Active comments first, then resolved, each in pin order (when each was made). */
  comments: ExportComment[];
}
