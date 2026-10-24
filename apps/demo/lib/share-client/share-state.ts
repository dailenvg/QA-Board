import { cropBlobKey, projectImageKey, snapshotBlobKey } from "../blob-store/keys";
import { SHARE_LIMITS } from "../share/limits";
import type { SharedComment, SharedSnapshot, ShareState } from "../share/types";
import type { Comment, Project, Snapshot } from "../store/types";

const cap = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

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
    ...(comment.crop ? { crop: { rect: comment.crop.rect } } : {}),
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
  const { source } = project;
  return {
    project: {
      name: cap(project.name, SHARE_LIMITS.projectName) || "Untitled",
      source:
        source.kind === "url"
          ? { kind: "url", url: source.url }
          : {
              kind: "image",
              fileName: cap(source.fileName, SHARE_LIMITS.fileName) || "image",
              ...(source.referenceUrl ? { referenceUrl: source.referenceUrl } : {}),
            },
    },
    snapshots: snapshots.map(sharedSnapshot),
    comments: comments.map(sharedComment),
  };
}

/** The local blob key for a share's blob key (`image` is the project's own image). */
export function localBlobKey(serverKey: string, projectId: string): string {
  return serverKey === "image" ? projectImageKey(projectId) : serverKey;
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
