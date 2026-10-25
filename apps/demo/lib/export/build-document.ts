import { pinNumbers } from "../store/selectors";
import type { Comment, Project, Snapshot } from "../store/types";
import { screenshotPath } from "./paths";
import type {
  ExportComment,
  ExportDocument,
  ExportLocation,
  ExportSnapshot,
  ExportSource,
  OmittedReason,
} from "./types";

export type SnapshotAsset = { file: string } | { omitted: OmittedReason };

/** What's known about the files that go with the comments (read from the blob store). */
export interface ExportAssets {
  /** Ids of comments whose crop is stored in this browser. */
  crops: ReadonlySet<string>;
  snapshots: ReadonlyMap<string, SnapshotAsset>;
  /** An image project's natural size and its path in the ZIP. */
  image: { width: number; height: number; file: string | null } | null;
}

export interface ExportInput {
  project: Project;
  /** The project's comments, oldest first (pin order). */
  comments: readonly Comment[];
  snapshots: readonly Snapshot[];
  assets: ExportAssets;
  exportedAt: number;
}

const round = (value: number) => Math.round(value);

function locate(
  comment: Comment,
  project: Project,
  snapshot: Snapshot | undefined,
  image: ExportAssets["image"],
): ExportLocation {
  const base = { xPercent: comment.x, yPercent: comment.y };
  const size = snapshot ?? (comment.snapshotId || project.source.kind === "url" ? null : image);
  const surface = comment.snapshotId
    ? "snapshot"
    : project.source.kind === "url"
      ? "frame"
      : "image";
  return {
    surface,
    snapshotId: comment.snapshotId ?? null,
    ...base,
    x: size ? round((comment.x / 100) * size.width) : null,
    y: size ? round((comment.y / 100) * size.height) : null,
    surfaceWidth: size?.width ?? null,
    surfaceHeight: size?.height ?? null,
  };
}

function pageUrl(project: Project, snapshot: Snapshot | undefined): string | null {
  if (snapshot) return snapshot.sourceUrl;
  const { source } = project;
  return source.kind === "url" ? source.url : (source.referenceUrl ?? null);
}

function exportSource(project: Project, image: ExportAssets["image"]): ExportSource {
  const { source } = project;
  if (source.kind === "url") return { kind: "url", url: source.url };
  return {
    kind: "image",
    fileName: source.fileName,
    referenceUrl: source.referenceUrl ?? null,
    width: image?.width ?? null,
    height: image?.height ?? null,
    file: image?.file ?? null,
  };
}

function exportSnapshot(snapshot: Snapshot, asset: SnapshotAsset | undefined): ExportSnapshot {
  const { id, width, height, createdAt, sourceUrl } = snapshot;
  return {
    id,
    width,
    height,
    createdAt,
    sourceUrl,
    file: asset && "file" in asset ? asset.file : null,
    omitted: asset && "omitted" in asset ? asset.omitted : asset ? null : "unavailable",
  };
}

/** Turns a project's comments into the export model: numbered, located and linked to files. */
export function buildExportDocument({
  project,
  comments,
  snapshots,
  assets,
  exportedAt,
}: ExportInput): ExportDocument {
  const numbers = pinNumbers(comments);
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const entries: ExportComment[] = comments.map((comment) => {
    const number = numbers.get(comment.id) ?? 0;
    const snapshot = comment.snapshotId ? byId.get(comment.snapshotId) : undefined;
    const crop = comment.crop && assets.crops.has(comment.id) ? comment.crop : null;
    return {
      number,
      id: comment.id,
      status: comment.status,
      author: comment.author,
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      resolvedAt: comment.resolvedAt ?? null,
      location: locate(comment, project, snapshot, assets.image),
      pageUrl: pageUrl(project, snapshot),
      screenshot: crop
        ? { file: screenshotPath(number, comment.id, comments.length), rect: crop.rect }
        : null,
    };
  });
  const order = (entry: ExportComment) => (entry.status === "active" ? 0 : 1);
  entries.sort((a, b) => order(a) - order(b) || a.number - b.number);
  const used = new Set(comments.flatMap((comment) => comment.snapshotId ?? []));
  return {
    exportedAt,
    project: {
      id: project.id,
      name: project.name,
      source: exportSource(project, assets.image),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    snapshots: snapshots
      .filter((snapshot) => used.has(snapshot.id))
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((snapshot) => exportSnapshot(snapshot, assets.snapshots.get(snapshot.id))),
    comments: entries,
  };
}
