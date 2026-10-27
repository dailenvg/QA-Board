"use client";

import type { CSSProperties } from "react";
import type { ProjectStatus } from "@/lib/store/status";
import { BlobImage } from "../../ui/BlobImage";
import { STATUS_DOT } from "../../ui/StatusChip";
import { hashString, rng } from "./art";
import { SHEET_W } from "./geometry";

export interface FolderFile {
  id: string;
  name: string;
  /** A short second line, such as a host or a kind. */
  meta?: string;
  /** Blob-store key of a picture; makes the file a picture. Without it, a sheet of paper. */
  imageKey?: string;
  status?: ProjectStatus;
}

interface FolderSheetProps {
  file: FolderFile;
  /** Position across the fan, -1 to 1. */
  slot: number;
  /** 0 for the front sheet, counting back. */
  depth: number;
  stackIndex: number;
  dropping: boolean;
  onDropEnd: () => void;
}

/** Ruled lines on a paper sheet, as widths. */
const LINES = ["86%", "92%", "64%", "88%", "42%"] as const;

/**
 * One file in the pocket: a preview of a project, not a way into it. It sits
 * inside the folder's own (hidden) link, so a click on it opens the folder.
 */
export function FolderSheet({
  file,
  slot,
  depth,
  stackIndex,
  dropping,
  onDropEnd,
}: FolderSheetProps) {
  // Jitter follows the id, so a sheet keeps its tilt through renames and reloads.
  const jitter = rng(hashString(file.id));
  const style = {
    "--gf-slot": slot,
    "--gf-depth": depth,
    "--gf-jx": `${((jitter() - 0.5) * 10).toFixed(2)}px`,
    "--gf-jr": `${((jitter() - 0.5) * 3.2).toFixed(2)}deg`,
    zIndex: stackIndex + 1,
  } as CSSProperties;
  const picture = Boolean(file.imageKey);

  return (
    <div
      data-testid="folder-sheet"
      className={`gf-sheet${picture ? " gf-sheet--art" : ""}${dropping ? " gf-sheet--drop" : ""}`}
      style={style}
      onAnimationEnd={dropping ? onDropEnd : undefined}
    >
      {file.imageKey ? (
        <BlobImage
          className="gf-sheet-art"
          blobKey={file.imageKey}
          alt=""
          fill
          sizes={`${SHEET_W}px`}
          draggable={false}
        />
      ) : (
        <span className="gf-lines">
          {LINES.map((width) => (
            <i key={width} style={{ width }} />
          ))}
        </span>
      )}
      <span className="gf-sheet-head">
        {file.status ? <span className={`gf-sheet-status ${STATUS_DOT[file.status]}`} /> : null}
        <span className="gf-sheet-name">{file.name}</span>
        {file.meta ? <span className="gf-sheet-meta">{file.meta}</span> : null}
      </span>
    </div>
  );
}
