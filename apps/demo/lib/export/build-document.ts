import { pagesOf } from "../store/pages";
import { pinNumbers } from "../store/selectors";
import type { Comment, Project, Snapshot } from "../store/types";
import { screenshotPath } from "./paths";
import type {
  ExportComment,
  ExportDocument,
  ExportLocation,
  ExportPage,
  ExportSnapshot,
  ExportSource,
  OmittedReason,
} from "./types";

export type SnapshotAsset = { file: string } | { omitted: OmittedReason };

/** A page's image as read for the export: its path in the ZIP or why it's left out, and its size. */
export type PageAsset = Pick<ExportPage, "width" | "height" | "file" | "omitted">;

/** What's known about the files that go with the comments (read from the blob store). */
export interface ExportAssets {
  /** Ids of comments whose crop is stored in this browser. */
  crops: ReadonlySet<string>;
  snapshots: ReadonlyMap<string, SnapshotAsset>;
  /** Page projects: each page's image, by page id. */
  pages: ReadonlyMap<string, PageAsset>;
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

/** Every page in reading order; a size the page doesn't record comes from its image. */
function exportPages(project: Project, assets: ExportAssets["pages"]): ExportPage[] {
  return pagesOf(project).map((page, index) => {
    const asset = assets.get(page.id);
    return {
      id: page.id,
      number: index + 1,
      name: page.name,
      width: page.width ?? asset?.width ?? null,
      height: page.height ?? asset?.height ?? null,
      file: asset?.file ?? null,
      omitted: asset ? asset.omitted : "unavailable",
    };
  });
}

function sizeOf(page: ExportPage | undefined): { width: number; height: number } | null {
  return page?.width && page.height ? { width: page.width, height: page.height } : null;
}

function locate(
  comment: Comment,
  snapshot: Snapshot | undefined,
  page: ExportPage | undefined,
): ExportLocation {
  const surface = comment.snapshotId ? "snapshot" : comment.pageId ? "page" : "frame";
  const size = surface === "snapshot" ? (snapshot ?? null) : sizeOf(page);
  return {
    surface,
    snapshotId: comment.snapshotId ?? null,
    page: page ? { id: page.id, number: page.number, name: page.name } : null,
    xPercent: comment.x,
    yPercent: comment.y,
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

function exportSource(project: Project, pages: ExportPage[]): ExportSource {
  const { source } = project;
  if (source.kind === "url") return { kind: "url", url: source.url };
  return {
    kind: "pages",
    origin: source.origin,
    fileName: source.fileName,
    referenceUrl: source.referenceUrl ?? null,
    pages,
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
  const pages = exportPages(project, assets.pages);
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const entries: ExportComment[] = comments.map((comment) => {
    const number = numbers.get(comment.id) ?? 0;
    const snapshot = comment.snapshotId ? byId.get(comment.snapshotId) : undefined;
    const page = comment.pageId && !comment.snapshotId ? pagesById.get(comment.pageId) : undefined;
    const onPage = page ? { number: page.number, total: pages.length } : null;
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
      location: locate(comment, snapshot, page),
      pageUrl: pageUrl(project, snapshot),
      screenshot: crop
        ? { file: screenshotPath(number, comment.id, comments.length, onPage), rect: crop.rect }
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
      source: exportSource(project, pages),
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
