import { pagesOf } from "../store/pages";
import { pinNumbers, pinOrder } from "../store/pin-numbers";
import type { Comment, Project, Reply, Snapshot } from "../store/types";
import { screenshotPath } from "./paths";
import type {
  ExportAudience,
  ExportComment,
  ExportDocument,
  ExportLocation,
  ExportPage,
  ExportReply,
  ExportSnapshot,
  ExportSource,
  OmittedReason,
} from "./types";

export type SnapshotAsset = { file: string } | { omitted: OmittedReason };

/** A page's image as read for the export: its path in the ZIP or why it's left out, and its size. */
export type PageAsset = Pick<ExportPage, "width" | "height" | "file" | "omitted">;

/** What's known about the files that go with the comments (read from the blob store). */
export interface ExportAssets {
  /** The MIME type of each comment's crop stored in this browser, by comment id. */
  crops: ReadonlyMap<string, string>;
  snapshots: ReadonlyMap<string, SnapshotAsset>;
  /** Page projects: each page's image, by page id. */
  pages: ReadonlyMap<string, PageAsset>;
}

export interface ExportInput {
  /** Who it's for (D14): the team by default. */
  audience?: ExportAudience;
  project: Project;
  /** The project's comments, oldest first (pin order). */
  comments: readonly Comment[];
  /** The project's replies, in any order: each goes under its comment, oldest first. */
  replies: readonly Reply[];
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

/** A reply as exported: under a team-only comment it's the team's too, whatever its own flag. */
function exportReply(reply: Reply, underTeamOnly: boolean): ExportReply {
  return {
    id: reply.id,
    author: reply.author,
    body: reply.body,
    createdAt: reply.createdAt,
    editedAt: reply.editedAt ?? null,
    fromClient: reply.fromClient === true,
    teamOnly: underTeamOnly || reply.teamOnly === true,
    clientInfo: reply.clientInfo ?? null,
  };
}

/** Each comment's replies as exported, oldest first, by comment id. */
function threads(
  comments: readonly Comment[],
  replies: readonly Reply[],
): Map<string, ExportReply[]> {
  const teamOnly = new Set(comments.flatMap((comment) => (comment.teamOnly ? comment.id : [])));
  const byComment = new Map<string, ExportReply[]>();
  const oldestFirst = [...replies].sort((a, b) => a.createdAt - b.createdAt);
  for (const reply of oldestFirst) {
    const exported = exportReply(reply, teamOnly.has(reply.commentId));
    byComment.set(reply.commentId, [...(byComment.get(reply.commentId) ?? []), exported]);
  }
  return byComment;
}

/**
 * What an export for `audience` may hold (D14): everything for the team; for a client, what the
 * review link shows, without team-only comments, their replies, team-only replies, or anyone's
 * browser details.
 */
export function forAudience(
  audience: ExportAudience,
  comments: readonly Comment[],
  replies: readonly Reply[],
): { comments: readonly Comment[]; replies: readonly Reply[] } {
  if (audience === "team") return { comments, replies };
  const shown = comments
    .filter((comment) => !comment.teamOnly)
    .map(({ clientInfo: _info, ...comment }) => comment);
  const ids = new Set(shown.map((comment) => comment.id));
  return {
    comments: shown,
    replies: replies
      .filter((reply) => ids.has(reply.commentId) && !reply.teamOnly)
      .map(({ clientInfo: _info, ...reply }) => reply),
  };
}

/** Turns a project's comments into the export model: numbered, located and linked to files. */
export function buildExportDocument({
  audience = "team",
  project,
  snapshots,
  assets,
  exportedAt,
  ...input
}: ExportInput): ExportDocument {
  const { comments, replies } = forAudience(audience, input.comments, input.replies);
  const numbers = pinNumbers(comments);
  const order = pinOrder(comments);
  const teamOnlyCount = comments.filter((comment) => comment.teamOnly).length;
  const repliesOf = threads(comments, replies);
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const pages = exportPages(project, assets.pages);
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const entries: ExportComment[] = comments.map((comment) => {
    const pin = numbers.get(comment.id) ?? { number: 0, teamOnly: false, label: "" };
    const total = pin.teamOnly ? teamOnlyCount : comments.length - teamOnlyCount;
    const snapshot = comment.snapshotId ? byId.get(comment.snapshotId) : undefined;
    const page = comment.pageId && !comment.snapshotId ? pagesById.get(comment.pageId) : undefined;
    const onPage = page ? { number: page.number, total: pages.length } : null;
    const cropType = assets.crops.get(comment.id);
    return {
      number: pin.number,
      label: pin.label,
      teamOnly: pin.teamOnly,
      id: comment.id,
      status: comment.status,
      priority: comment.priority ?? null,
      author: comment.author,
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      resolvedAt: comment.resolvedAt ?? null,
      location: locate(comment, snapshot, page),
      pageUrl: pageUrl(project, snapshot),
      screenshot:
        comment.crop && cropType !== undefined
          ? {
              file: screenshotPath(pin, comment.id, total, cropType, onPage),
              rect: comment.crop.rect,
            }
          : null,
      clientInfo: comment.clientInfo ?? null,
      replies: repliesOf.get(comment.id) ?? [],
    };
  });
  const group = (entry: ExportComment) => (entry.status === "active" ? 0 : 1);
  const made = (entry: ExportComment) => order.get(entry.id) ?? 0;
  entries.sort((a, b) => group(a) - group(b) || made(a) - made(b));
  const used = new Set(comments.flatMap((comment) => comment.snapshotId ?? []));
  return {
    audience,
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
