import { snapshotBlobKey } from "../blob-store/keys";
import { commentsFor } from "../store/selectors";
import { snapshotsFor } from "../store/snapshots";
import { dispatch, getSnapshot } from "../store/store";
import type { ClientEdit, Comment, Project, ProjectShare, Reply, Snapshot } from "../store/types";
import { storeWorkspaceBlob } from "../workspace-client/blob-upload";
import { workspaceBlobs } from "../workspace-client/workspace-store";
import { ownerApi } from "./api";
import type { ShareChanges, ShareState } from "../share/types";
import { batchChange, diffState } from "./diff";
import {
  clientReplyIds,
  fromSharedComment,
  fromSharedReply,
  fromSharedSnapshot,
  localBlobKey,
  toShareState,
} from "./share-state";

export type SyncPhase = "idle" | "syncing" | "error" | "gone";

export interface SyncStatus {
  phase: SyncPhase;
  /** Client additions are waiting on a temporary error; the next pull tries again. */
  pullHeld: boolean;
  /** Last successful push or pull in this visit. */
  checkedAt: number | null;
  /** Images still to upload, while uploading. */
  uploading: { done: number; total: number } | null;
}

const RETRY_MS = [2_000, 5_000, 15_000, 30_000];
const IDLE: SyncStatus = { phase: "idle", pullHeld: false, checkedAt: null, uploading: null };

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

/**
 * What the project pushes, and which of its replies are clients' (sent only
 * while the link lacks them: `diffState`).
 */
function stateOf(project: Project): { state: ShareState; settled: Set<string> } | null {
  const state = getSnapshot();
  if (state.status !== "ready") return null;
  const { data } = state;
  return {
    state: toShareState(
      project,
      commentsFor(data, project.id),
      snapshotsFor(data, project.id),
      data.replies,
    ),
    settled: clientReplyIds(data.replies, project.id),
  };
}

/** The ids of the project's comments in the store right now. */
function commentIdsOf(projectId: string): Set<string> {
  const state = getSnapshot();
  if (state.status !== "ready") return new Set();
  return new Set(commentsFor(state.data, projectId).map((comment) => comment.id));
}

/** Uploads the images the share asked for, read from the workspace. */
async function uploadMissing(project: Project, share: ProjectShare, keys: readonly string[]) {
  let done = 0;
  update(project.id, { uploading: keys.length ? { done, total: keys.length } : null });
  for (const key of keys) {
    const local = localBlobKey(key, project);
    const blob = local ? await workspaceBlobs()?.get(local) : null;
    // An image the workspace doesn't have stays missing for clients too; nothing to retry.
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
 * Brings the share up to date with the owner's state: reads the server's
 * manifest, sends only what differs, in batches small enough for any request
 * limit, then uploads the images the server still lacks. Failures retry with
 * backoff; a 404 means the link was revoked (or the server forgot it).
 */
export async function pushNow(projectId: string): Promise<void> {
  const entry = controller(projectId);
  if (entry.pushing) {
    entry.dirty = true;
    return;
  }
  const found = current(projectId);
  const local = found && stateOf(found.project);
  if (!found || !local) return;
  entry.pushing = true;
  update(projectId, { phase: "syncing" });
  const outcome = await sendChanges(found.project, found.share, local);
  entry.pushing = false;
  if (outcome === "gone") {
    update(projectId, { phase: "gone", uploading: null });
    return;
  }
  if (outcome === "failed") {
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

async function sendChanges(
  project: Project,
  share: ProjectShare,
  { state, settled }: { state: ShareState; settled: ReadonlySet<string> },
): Promise<"done" | "failed" | "gone"> {
  const manifest = await ownerApi.manifest(share);
  if (!manifest.ok) return manifest.status === 404 ? "gone" : "failed";
  let missing = manifest.value.missingBlobs;
  for (const batch of batchChange(diffState(state, manifest.value, settled), share.cursor)) {
    const applied = await ownerApi.change(share, batch);
    if (!applied.ok) return applied.status === 404 ? "gone" : "failed";
    missing = applied.value.missingBlobs;
  }
  return (await uploadMissing(project, share, missing)) ? "done" : "failed";
}

type Copied = "copied" | "missing" | "retry";

/**
 * Copies a client image into the workspace: "missing" when the share can
 * never send it (a 404 or another permanent answer), "retry" when the failure
 * is temporary (network, server error) or the workspace couldn't take it.
 */
async function copyBlob(share: ProjectShare, projectId: string, key: string): Promise<Copied> {
  const fetched = await ownerApi.download(share, key);
  if (!fetched.ok) return fetched.permanent ? "missing" : "retry";
  return (await storeWorkspaceBlob(projectId, key, fetched.blob)).ok ? "copied" : "retry";
}

/**
 * Merges what arrived. A comment whose crop is gone for good comes without
 * it. An edit to a comment pulled before brings only its new words: its crop
 * is already here. A client's reply merges only under a comment that's here
 * or arriving with it; otherwise (its comment held back, or deleted here and
 * not yet on the link) it's held, so the cursor stays and the next pull
 * brings it again, once its comment has come or the push has taken it away.
 */
async function collect(share: ProjectShare, projectId: string, changes: ShareChanges) {
  let held = false;
  const snapshots: Snapshot[] = [];
  for (const snapshot of changes.snapshots) {
    const copied = await copyBlob(share, projectId, snapshotBlobKey(snapshot.id));
    if (copied === "retry") held = true;
    // A missing image still merges: the snapshot shows its "not available" state.
    else snapshots.push(fromSharedSnapshot(snapshot, projectId));
  }
  const edits: ClientEdit[] = changes.comments.flatMap((comment) =>
    comment.edited && comment.editedAt !== undefined
      ? [{ id: comment.id, body: comment.body, editedAt: comment.editedAt }]
      : [],
  );
  const comments: Comment[] = [];
  for (const comment of changes.comments.filter((entry) => !entry.edited)) {
    const copied = comment.crop ? await copyBlob(share, projectId, `crop:${comment.id}`) : "copied";
    if (copied === "retry") {
      held = true;
      continue;
    }
    const { crop: _gone, ...withoutCrop } = comment;
    const pulled = fromSharedComment(copied === "missing" ? withoutCrop : comment, projectId);
    // Pulls bring clients' comments only; the workspace marks them so too once saved.
    comments.push({ ...pulled, fromClient: true });
  }
  const placed = new Set([...commentIdsOf(projectId), ...comments.map((comment) => comment.id)]);
  const replies: Reply[] = [];
  for (const reply of changes.replies) {
    if (placed.has(reply.commentId)) replies.push(fromSharedReply(reply, projectId));
    else held = true;
  }
  return { snapshots, comments, replies, edits, held };
}

/**
 * Pulls client comments, replies and snapshots added since the last pull (and
 * clients' edits since), copies their images into the workspace, then merges them
 * (idempotent by id; an edit only reaches a comment still here), which saves
 * them and the new pull position to the workspace too. Only a temporary failure
 * holds the cursor back, so the next pull asks again; an image that can never
 * arrive doesn't stall anything. While anything is held, sync isn't shown as done.
 */
export async function pullNow(projectId: string): Promise<void> {
  const found = current(projectId);
  if (!found) return;
  const { share } = found;
  const result = await ownerApi.pull(share);
  if (!result.ok) {
    update(projectId, result.status === 404 ? { phase: "gone" } : { pullHeld: true });
    return;
  }
  const { snapshots, comments, replies, edits, held } = await collect(
    share,
    projectId,
    result.value,
  );
  const cursor = held ? share.cursor : result.value.cursor;
  const at = Date.now();
  const arrived = comments.length + replies.length + snapshots.length + edits.length;
  if (arrived > 0 || cursor !== share.cursor) {
    dispatch({
      type: "share/merge",
      id: projectId,
      comments,
      replies,
      snapshots,
      edits,
      cursor,
      at,
    });
  }
  update(projectId, held ? { pullHeld: true } : { pullHeld: false, checkedAt: at });
}

/** Push and pull now (the Retry buttons). */
export function syncNow(projectId: string): void {
  void pushNow(projectId);
  void pullNow(projectId);
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
