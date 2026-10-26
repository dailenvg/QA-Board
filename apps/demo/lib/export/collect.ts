import type { BlobSource } from "../blob-store/blob-source";
import { pagesOf } from "../store/pages";
import { commentsFor } from "../store/selectors";
import { snapshotsFor } from "../store/snapshots";
import type { Comment, Page, Project, Snapshot, SquintData } from "../store/types";
import { buildExportDocument, type PageAsset, type SnapshotAsset } from "./build-document";
import { pagePath, snapshotPath } from "./paths";
import type { ExportDocument } from "./types";

/**
 * Page and full-page snapshot images are big; past this many bytes together,
 * the rest are left out (and noted). Pages with comments come first, then the
 * other pages, then snapshots.
 */
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;

export interface CollectedExport {
  document: ExportDocument;
  /** Files for the ZIP, by path. */
  files: Map<string, Blob>;
}

/** What's left of `MAX_IMAGE_BYTES`, shared by every image of one export. */
interface Budget {
  left: number;
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
  budget: Budget,
): Promise<{ assets: Map<string, SnapshotAsset>; blobs: Map<string, Blob> }> {
  const assets = new Map<string, SnapshotAsset>();
  const files = new Map<string, Blob>();
  for (const snapshot of snapshots) {
    const blob = await blobs.get(snapshot.blobKey);
    if (!blob) {
      assets.set(snapshot.id, { omitted: "unavailable" });
    } else if (blob.size > budget.left) {
      assets.set(snapshot.id, { omitted: "too-large" });
    } else {
      budget.left -= blob.size;
      const file = snapshotPath(snapshot.id, blob.type);
      assets.set(snapshot.id, { file });
      files.set(file, blob);
    }
  }
  return { assets, blobs: files };
}

/** An image's natural size, or null when it can't be decoded. */
async function measure(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** One page's image: in the ZIP while the budget lasts, measured when the page has no size. */
async function readPage(
  page: Page,
  path: (mimeType: string) => string,
  blobs: BlobSource,
  budget: Budget,
): Promise<{ asset: PageAsset; blob: Blob | null }> {
  const blob = await blobs.get(page.blobKey);
  if (!blob) {
    return { asset: { width: null, height: null, file: null, omitted: "unavailable" }, blob: null };
  }
  const size = page.width === undefined ? await measure(blob) : null;
  const known = { width: size?.width ?? null, height: size?.height ?? null };
  if (blob.size > budget.left) {
    return { asset: { ...known, file: null, omitted: "too-large" }, blob: null };
  }
  budget.left -= blob.size;
  return { asset: { ...known, file: path(blob.type), omitted: null }, blob };
}

async function readPages(
  project: Project,
  comments: readonly Comment[],
  blobs: BlobSource,
  budget: Budget,
): Promise<{ assets: Map<string, PageAsset>; blobs: Map<string, Blob> }> {
  const pages = pagesOf(project);
  const commented = new Set(comments.flatMap((comment) => comment.pageId ?? []));
  const numbered = pages.map((page, index) => ({ page, number: index + 1 }));
  const order = [
    ...numbered.filter(({ page }) => commented.has(page.id)),
    ...numbered.filter(({ page }) => !commented.has(page.id)),
  ];
  const assets = new Map<string, PageAsset>();
  const files = new Map<string, Blob>();
  for (const { page, number } of order) {
    const path = (mimeType: string) => pagePath({ number, total: pages.length }, mimeType);
    const read = await readPage(page, path, blobs, budget);
    assets.set(page.id, read.asset);
    if (read.asset.file && read.blob) files.set(read.asset.file, read.blob);
  }
  return { assets, blobs: files };
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
  const budget: Budget = { left: MAX_IMAGE_BYTES };
  const crops = await readCrops(comments, blobs);
  const pages = await readPages(project, comments, blobs, budget);
  const stored = await readSnapshots(snapshots, blobs, budget);
  const document = buildExportDocument({
    project,
    comments,
    snapshots,
    assets: { crops: new Set(crops.keys()), snapshots: stored.assets, pages: pages.assets },
    exportedAt,
  });
  const files = new Map([...pages.blobs, ...stored.blobs]);
  for (const comment of document.comments) {
    const blob = crops.get(comment.id);
    if (comment.screenshot && blob) files.set(comment.screenshot.file, blob);
  }
  return { document, files };
}
