import type { CommentStatus, Rect } from "../store/types";

/** What a pin's percentages are relative to. */
export type ExportSurface = "snapshot" | "image" | "frame";

/** Why a snapshot image isn't in the ZIP. */
export type OmittedReason = "too-large" | "unavailable";

export interface ExportLocation {
  surface: ExportSurface;
  snapshotId: string | null;
  xPercent: number;
  yPercent: number;
  /** Page (or image) px; null on the live frame, whose page size isn't known. */
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

export type ExportSource =
  | { kind: "url"; url: string }
  | {
      kind: "image";
      fileName: string;
      referenceUrl: string | null;
      width: number | null;
      height: number | null;
      file: string | null;
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
