import { cropBlobKey, snapshotBlobKey } from "../blob-store/keys";
import { SHARE_LIMITS } from "../share/limits";
import type {
  SharedComment,
  SharedPage,
  SharedSnapshot,
  SharedSource,
  ShareState,
} from "../share/types";
import { pagesOf } from "../store/pages";
import type { Comment, Page, Project, Snapshot } from "../store/types";

/**
 * Trimmed and capped exactly as the server's schema stores it, so content
 * digests match and unchanged items are never sent again.
 */
const cap = (text: string, max: number) => text.trim().slice(0, max).trim();

function sharedComment(comment: Comment): SharedComment {
  return {
    id: comment.id,
    x: comment.x,
    y: comment.y,
    // Older comments may predate the length limits; trimming beats refusing the whole push.
    body: cap(comment.body, SHARE_LIMITS.body),
    author: cap(comment.author, SHARE_LIMITS.author) || "Reviewer",
    status: comment.status,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    ...(comment.resolvedAt !== undefined ? { resolvedAt: comment.resolvedAt } : {}),
    ...(comment.snapshotId ? { snapshotId: comment.snapshotId } : {}),
    ...(comment.pageId ? { pageId: comment.pageId } : {}),
    ...(comment.crop ? { crop: { rect: comment.crop.rect } } : {}),
  };
}

function sharedPage({ id, name, width, height }: Page, index: number): SharedPage {
  return {
    id,
    name: cap(name, SHARE_LIMITS.fileName) || `Page ${index + 1}`,
    ...(width !== undefined && height !== undefined ? { width, height } : {}),
  };
}

function sharedSource(project: Project): SharedSource {
  const { source } = project;
  if (source.kind === "url") return { kind: "url", url: source.url };
  return {
    kind: "pages",
    origin: source.origin,
    fileName: cap(source.fileName, SHARE_LIMITS.fileName) || "image",
    ...(source.referenceUrl ? { referenceUrl: source.referenceUrl } : {}),
    pages: source.pages.map(sharedPage),
  };
}

function sharedSnapshot({
  id,
  width,
  height,
  createdAt,
  sourceUrl,
  scale,
}: Snapshot): SharedSnapshot {
  return { id, width, height, createdAt, sourceUrl, ...(scale !== undefined ? { scale } : {}) };
}

/** What the owner pushes: the project's metadata, snapshots and comments, without local keys. */
export function toShareState(
  project: Project,
  comments: readonly Comment[],
  snapshots: readonly Snapshot[],
): ShareState {
  return {
    project: {
      name: cap(project.name, SHARE_LIMITS.projectName) || "Untitled",
      source: sharedSource(project),
    },
    snapshots: snapshots.map(sharedSnapshot),
    comments: comments.map(sharedComment),
  };
}

/**
 * The local blob key for a share's blob key: a page's picture is wherever the
 * page says (`page:<pageId>` on the server); null for a page the project doesn't have.
 */
export function localBlobKey(serverKey: string, project: Project): string | null {
  const pageId = /^page:(.+)$/.exec(serverKey)?.[1];
  if (pageId === undefined) return serverKey;
  return pagesOf(project).find((page) => page.id === pageId)?.blobKey ?? null;
}

export function fromSharedComment(comment: SharedComment, projectId: string): Comment {
  const { crop, ...rest } = comment;
  return {
    ...rest,
    projectId,
    ...(crop ? { crop: { blobKey: cropBlobKey(comment.id), rect: crop.rect } } : {}),
  };
}

export function fromSharedSnapshot(snapshot: SharedSnapshot, projectId: string): Snapshot {
  return { ...snapshot, projectId, blobKey: snapshotBlobKey(snapshot.id) };
}
