import type { CommentStatus, PageOrigin, Rect } from "../store/types";

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

export interface ExportComment {
  number: number;
  id: string;
  status: CommentStatus;
  author: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
  location: ExportLocation;
  pageUrl: string | null;
  /** The crop, when this browser still has it; `file` is its path in the ZIP. */
  screenshot: { file: string; rect: Rect } | null;
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
export interface ExportDocument {
  exportedAt: number;
  project: { id: string; name: string; source: ExportSource; createdAt: number; updatedAt: number };
  /** Only the snapshots that exported comments sit on, oldest first. */
  snapshots: ExportSnapshot[];
  /** Active comments first, then resolved, each in pin-number order. */
  comments: ExportComment[];
}
