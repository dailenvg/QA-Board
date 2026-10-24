import type { BlobSource } from "../blob-store/blob-source";
import { commentsFor } from "../store/selectors";
import { snapshotsFor } from "../store/snapshots";
import type { Comment, Project, Snapshot, SquintData } from "../store/types";
import { buildExportDocument, type ExportAssets, type SnapshotAsset } from "./build-document";
import { snapshotPath, sourceImagePath } from "./paths";
import type { ExportDocument } from "./types";

/** Full-page snapshots are big; past this many bytes together, the rest are left out (and noted). */
const MAX_SNAPSHOT_BYTES = 40 * 1024 * 1024;

export interface CollectedExport {
  document: ExportDocument;
  /** Files for the ZIP, by path. */
  files: Map<string, Blob>;
}

async function readCrops(
  comments: readonly Comment[],
  blobs: BlobSource,
): Promise<Map<string, Blob>> {
  const entries = await Promise.all(
    comments.map(async (comment) => {
      const blob = comment.crop ? await blobs.get(comment.crop.blobKey) : null;
      return blob ? ([comment.id, blob] as const) : null;
    }),
  );
  return new Map(entries.filter((entry) => entry !== null));
}

async function readSnapshots(
  snapshots: readonly Snapshot[],
  blobs: BlobSource,
): Promise<{ assets: Map<string, SnapshotAsset>; blobs: Map<string, Blob> }> {
  const assets = new Map<string, SnapshotAsset>();
  const files = new Map<string, Blob>();
  let budget = MAX_SNAPSHOT_BYTES;
  for (const snapshot of snapshots) {
    const blob = await blobs.get(snapshot.blobKey);
    if (!blob) {
      assets.set(snapshot.id, { omitted: "unavailable" });
    } else if (blob.size > budget) {
      assets.set(snapshot.id, { omitted: "too-large" });
    } else {
      budget -= blob.size;
      const file = snapshotPath(snapshot.id, blob.type);
      assets.set(snapshot.id, { file });
      files.set(file, blob);
    }
  }
  return { assets, blobs: files };
}

async function readImage(
  project: Project,
  blobs: BlobSource,
): Promise<{ image: ExportAssets["image"]; blob: Blob | null }> {
  if (project.source.kind !== "image") return { image: null, blob: null };
  try {
    const blob = await blobs.get(project.source.blobKey);
    if (!blob) return { image: null, blob: null };
    const bitmap = await createImageBitmap(blob);
    const image = { width: bitmap.width, height: bitmap.height, file: sourceImagePath(blob.type) };
    bitmap.close();
    return { image, blob };
  } catch {
    return { image: null, blob: null };
  }
}

/**
 * Gathers a project's comments and the images that go with them (from this
 * browser's storage, or a share's), and builds the export model around what was found.
 */
export async function collectExport(
  data: SquintData,
  project: Project,
  exportedAt: number,
  blobs: BlobSource,
): Promise<CollectedExport> {
  const comments = commentsFor(data, project.id);
  const used = new Set(comments.flatMap((comment) => comment.snapshotId ?? []));
  const snapshots = snapshotsFor(data, project.id).filter((snapshot) => used.has(snapshot.id));
  const [crops, stored, source] = await Promise.all([
    readCrops(comments, blobs),
    readSnapshots(snapshots, blobs),
    readImage(project, blobs),
  ]);
  const document = buildExportDocument({
    project,
    comments,
    snapshots,
    assets: { crops: new Set(crops.keys()), snapshots: stored.assets, image: source.image },
    exportedAt,
  });
  const files = new Map(stored.blobs);
  for (const comment of document.comments) {
    const blob = crops.get(comment.id);
    if (comment.screenshot && blob) files.set(comment.screenshot.file, blob);
  }
  if (source.image?.file && source.blob) files.set(source.image.file, source.blob);
  return { document, files };
}
