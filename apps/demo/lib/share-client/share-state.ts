import { cropBlobKey, snapshotBlobKey } from "../blob-store/keys";
import { parsePageBlobKey } from "../share/keys";
import { SHARE_LIMITS } from "../share/limits";
import type {
  PulledComment,
  PulledReply,
  SharedComment,
  SharedPage,
  SharedReply,
  SharedSnapshot,
  SharedSource,
  ShareState,
} from "../share/types";
import { pagesOf } from "../store/pages";
import type { Comment, Page, Project, Reply, Snapshot } from "../store/types";

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
    ...(comment.editedAt !== undefined ? { editedAt: comment.editedAt } : {}),
    ...(comment.snapshotId ? { snapshotId: comment.snapshotId } : {}),
    ...(comment.pageId ? { pageId: comment.pageId } : {}),
    ...(comment.crop ? { crop: { rect: comment.crop.rect } } : {}),
  };
}

function sharedReply(reply: Reply): SharedReply {
  return {
    id: reply.id,
    commentId: reply.commentId,
    body: cap(reply.body, SHARE_LIMITS.body),
    author: cap(reply.author, SHARE_LIMITS.author) || "Reviewer",
    createdAt: reply.createdAt,
    ...(reply.editedAt !== undefined ? { editedAt: reply.editedAt } : {}),
  };
}

function sharedPage({ id, name, width, height, rev }: Page, index: number): SharedPage {
  return {
    id,
    name: cap(name, SHARE_LIMITS.fileName) || `Page ${index + 1}`,
    ...(width !== undefined && height !== undefined ? { width, height } : {}),
    ...(rev ? { rev } : {}),
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

/**
 * What the owner pushes: the project's metadata, snapshots, comments and the
 * replies to those comments, without local keys. The one place that decides
 * what reaches a review link (D21): a reply only under a comment it carries;
 * of a comment or a reply, whose it is, the author's photo and the browser it
 * was posted from (`clientInfo`, team only) never do. `replies` may be the
 * workspace's: only this project's are taken.
 */
export function toShareState(
  project: Project,
  comments: readonly Comment[],
  snapshots: readonly Snapshot[],
  replies: readonly Reply[],
): ShareState {
  const shared = new Set(comments.map((comment) => comment.id));
  return {
    project: {
      name: cap(project.name, SHARE_LIMITS.projectName) || "Untitled",
      source: sharedSource(project),
      createdAt: project.createdAt,
    },
    snapshots: snapshots.map(sharedSnapshot),
    comments: comments.map(sharedComment),
    replies: replies
      .filter((reply) => reply.projectId === project.id && shared.has(reply.commentId))
      .map(sharedReply),
  };
}

/**
 * The local blob key for a share's blob key: a page's picture is wherever the
 * page says; null for a page (or a revision of it) the project doesn't have.
 */
export function localBlobKey(serverKey: string, project: Project): string | null {
  const key = parsePageBlobKey(serverKey);
  if (!key) return serverKey.startsWith("page:") ? null : serverKey;
  const page = pagesOf(project).find((entry) => entry.id === key.pageId);
  return page && (page.rev ?? 0) === key.rev ? page.blobKey : null;
}

export function fromSharedComment(comment: PulledComment, projectId: string): Comment {
  const { crop, edited: _edited, ...rest } = comment;
  return {
    ...rest,
    projectId,
    ...(crop ? { crop: { blobKey: cropBlobKey(comment.id), rect: crop.rect } } : {}),
  };
}

/** A client's reply pulled from the link, in the workspace's shape: a client's, with its browser. */
export function fromSharedReply(reply: PulledReply, projectId: string): Reply {
  return { ...reply, projectId, fromClient: true };
}

/**
 * The project's replies that clients posted: the link keeps each as it is
 * once it has it (`upsertReply` never changes a client's row, and nobody
 * edits one), so a push only sends one the link doesn't have yet.
 */
export function clientReplyIds(replies: readonly Reply[], projectId: string): Set<string> {
  return new Set(
    replies
      .filter((reply) => reply.fromClient && reply.projectId === projectId)
      .map((reply) => reply.id),
  );
}

export function fromSharedSnapshot(snapshot: SharedSnapshot, projectId: string): Snapshot {
  return { ...snapshot, projectId, blobKey: snapshotBlobKey(snapshot.id) };
}
