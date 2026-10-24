import { getBlob, putBlob } from "../blob-store/blob-store";
import { snapshotBlobKey } from "../blob-store/keys";
import { commentsFor } from "../store/selectors";
import { snapshotsFor } from "../store/snapshots";
import { dispatch, getSnapshot } from "../store/store";
import type { Comment, Project, ProjectShare, Snapshot } from "../store/types";
import { ownerApi } from "./api";
import { fromSharedComment, fromSharedSnapshot, localBlobKey, toShareState } from "./share-state";

export type SyncPhase = "idle" | "syncing" | "error" | "gone";

export interface SyncStatus {
  phase: SyncPhase;
  /** Last successful push or pull in this visit. */
  checkedAt: number | null;
  /** Images still to upload, while uploading. */
  uploading: { done: number; total: number } | null;
}

const RETRY_MS = [2_000, 5_000, 15_000, 30_000];
const IDLE: SyncStatus = { phase: "idle", checkedAt: null, uploading: null };

interface Controller {
  status: SyncStatus;
  listeners: Set<() => void>;
  pushing: boolean;
  /** A change arrived while a push was in flight; push again after it. */
  dirty: boolean;
  attempts: number;
  retry: ReturnType<typeof setTimeout> | null;
}

const controllers = new Map<string, Controller>();

function controller(projectId: string): Controller {
  let found = controllers.get(projectId);
  if (!found) {
    found = {
      status: IDLE,
      listeners: new Set(),
      pushing: false,
      dirty: false,
      attempts: 0,
      retry: null,
    };
    controllers.set(projectId, found);
  }
  return found;
}

function update(projectId: string, change: Partial<SyncStatus>): void {
  const entry = controller(projectId);
  entry.status = { ...entry.status, ...change };
  for (const listener of entry.listeners) listener();
}

export function subscribeSync(projectId: string, listener: () => void): () => void {
  const entry = controller(projectId);
  entry.listeners.add(listener);
  return () => entry.listeners.delete(listener);
}

export function syncStatus(projectId: string): SyncStatus {
  return controller(projectId).status;
}

/** The project as it is in the store right now. */
function current(projectId: string): { project: Project; share: ProjectShare } | null {
  const state = getSnapshot();
  if (state.status !== "ready") return null;
  const project = state.data.projects.find((entry) => entry.id === projectId);
  return project?.share ? { project, share: project.share } : null;
}

function stateOf(project: Project) {
  const state = getSnapshot();
  if (state.status !== "ready") return null;
  return toShareState(
    project,
    commentsFor(state.data, project.id),
    snapshotsFor(state.data, project.id),
  );
}

/** Uploads the images the server asked for, from this browser's blob store. */
async function uploadMissing(project: Project, share: ProjectShare, keys: readonly string[]) {
  let done = 0;
  update(project.id, { uploading: keys.length ? { done, total: keys.length } : null });
  for (const key of keys) {
    const blob = await getBlob(localBlobKey(key, project.id));
    // A missing local image stays missing for clients too; nothing to retry.
    if (blob) {
      const uploaded = await ownerApi.upload(share, key, blob);
      if (!uploaded.ok && uploaded.status !== 413 && uploaded.status !== 422) return false;
    }
    done += 1;
    update(project.id, { uploading: { done, total: keys.length } });
  }
  update(project.id, { uploading: null });
  return true;
}

function scheduleRetry(projectId: string): void {
  const entry = controller(projectId);
  const delay = RETRY_MS[Math.min(entry.attempts, RETRY_MS.length - 1)] ?? 30_000;
  entry.attempts += 1;
  if (entry.retry) clearTimeout(entry.retry);
  entry.retry = setTimeout(() => {
    entry.retry = null;
    void pushNow(projectId);
  }, delay);
}

/**
 * Sends the project's whole state; the server matches it and lists the images
 * it lacks, which are uploaded next. Failures retry with backoff; a 404 means
 * the link was revoked (or the server forgot it).
 */
export async function pushNow(projectId: string): Promise<void> {
  const entry = controller(projectId);
  if (entry.pushing) {
    entry.dirty = true;
    return;
  }
  const found = current(projectId);
  const state = found && stateOf(found.project);
  if (!found || !state) return;
  entry.pushing = true;
  update(projectId, { phase: "syncing" });
  const result = await ownerApi.push(found.share, state);
  const uploaded =
    result.ok && (await uploadMissing(found.project, found.share, result.value.missingBlobs));
  entry.pushing = false;
  if (!result.ok && result.status === 404) {
    update(projectId, { phase: "gone", uploading: null });
    return;
  }
  if (!uploaded) {
    update(projectId, { phase: "error", uploading: null });
    scheduleRetry(projectId);
    return;
  }
  entry.attempts = 0;
  const at = Date.now();
  dispatch({ type: "share/synced", id: projectId, at });
  update(projectId, { phase: "idle", checkedAt: at });
  if (entry.dirty) {
    entry.dirty = false;
    void pushNow(projectId);
  }
}

/** Copies a client image into this browser's blob store; false if it couldn't be read. */
async function copyBlob(share: ProjectShare, key: string): Promise<boolean> {
  const blob = await ownerApi.download(share, key);
  return blob ? putBlob(key, blob) : false;
}

/**
 * Pulls client comments and snapshots added since the last pull, copies their
 * images here, then merges them (idempotent by id). Images that can't be
 * fetched yet leave their item for the next pull.
 */
export async function pullNow(projectId: string): Promise<void> {
  const found = current(projectId);
  if (!found) return;
  const { share } = found;
  const result = await ownerApi.pull(share);
  if (!result.ok) {
    if (result.status === 404) update(projectId, { phase: "gone" });
    return;
  }
  const { comments, snapshots, cursor } = result.value;
  const ready = async <T>(items: readonly T[], key: (item: T) => string | null) => {
    const kept: T[] = [];
    for (const item of items) {
      const blobKey = key(item);
      if (!blobKey || (await copyBlob(share, blobKey))) kept.push(item);
      else return { kept, complete: false };
    }
    return { kept, complete: true };
  };
  const shots = await ready(snapshots, (snapshot) => snapshotBlobKey(snapshot.id));
  const notes = await ready(comments, (comment) => (comment.crop ? `crop:${comment.id}` : null));
  const complete = shots.complete && notes.complete;
  const merged: { comments: Comment[]; snapshots: Snapshot[] } = {
    snapshots: shots.kept.map((snapshot) => fromSharedSnapshot(snapshot, projectId)),
    comments: notes.kept.map((comment) => fromSharedComment(comment, projectId)),
  };
  const at = Date.now();
  if (merged.comments.length || merged.snapshots.length || cursor !== share.cursor) {
    dispatch({
      type: "share/merge",
      id: projectId,
      ...merged,
      // Only move past everything when every image arrived; otherwise ask again next time.
      cursor: complete ? cursor : share.cursor,
      at,
    });
  }
  update(projectId, { checkedAt: at });
}

/** Forgets a project's sync state (after revoking or when the link is gone). */
export function resetSync(projectId: string): void {
  const entry = controllers.get(projectId);
  if (entry?.retry) clearTimeout(entry.retry);
  if (entry) {
    entry.attempts = 0;
    entry.dirty = false;
    update(projectId, IDLE);
  }
}
