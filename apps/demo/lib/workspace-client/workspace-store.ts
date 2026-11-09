import { emitSquiggy } from "../squiggy/events";
import { call, jsonInit } from "../share-client/api";
import { reduce, type Action } from "../store/reducer";
import type { SquintData } from "../store/types";
import type {
  ClientCommentActivity,
  ShareLink,
  WorkspaceData,
  WorkspaceStart,
} from "../workspace/types";
import { createWorkspaceBlobs, type WorkspaceBlobs } from "./blob-source";
import { refusalMessage, writesFor, type ServerWrite } from "./mutations";
import { openTabSync, type TabSync } from "./tab-sync";
import { fileOrphans, projectsMissingLinks, toSquintData } from "./workspace-data";

/**
 * The signed-in workspace in this tab: the server's data, changed at once by
 * each action (optimistic) while its requests go out one at a time, in order.
 * A refused request rolls its action back; a later read from the server (on
 * focus, or when another tab says it changed something) settles any
 * difference, and the last write wins. Module-level, so it lives across the
 * dashboard and viewer; it's never touched on the server.
 */

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

/** Why the workspace can't be shown: the session ended, or the workspace is gone for this user. */
export type WorkspaceFailure = "signed-out" | "gone";

export type WorkspaceState =
  | { status: "loading" }
  | { status: "ready"; data: SquintData }
  | { status: "error"; reason: WorkspaceFailure };

interface Connection {
  workspaceId: string;
  blobs: WorkspaceBlobs;
  tabs: TabSync;
  /** Review link secrets by share id: the snapshot route never sends them. */
  links: Map<string, ShareLink>;
}

interface Job {
  action: Action;
  before: SquintData;
  after: SquintData;
  writes: ServerWrite[];
  /** The caller waits for the outcome and reports it; no notice then. */
  quiet: boolean;
}

const LOADING: WorkspaceState = { status: "loading" };
const OK: Result = { ok: true, value: undefined };
const UNAVAILABLE = "That change didn't save. Reload the page and try again.";
/** The same notice again within this long is shown once. */
const NOTICE_REPEAT_MS = 3_000;
/**
 * A server render this soon after one of this tab's saves may predate it:
 * read the server again rather than show the render.
 */
const RECENT_SAVE_MS = 10_000;

let connection: Connection | null = null;
let state: WorkspaceState = LOADING;
/** Clients' comments as of the last server read; null until this tab connects. */
let clientActivity: readonly ClientCommentActivity[] | null = null;
const listeners = new Set<() => void>();
const noticeListeners = new Set<(message: string) => void>();
let lastNotice = { message: "", at: 0 };

/** The tail of the request queue, and how many actions are still on it. */
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
/** Bumped by every applied action, so a read that raced one is thrown away. */
let changes = 0;
let reading: Promise<void> | null = null;
let readAgain = false;
/** When this tab last finished saving something. */
let lastSavedAt = 0;
/** Each server render's state, made once: the same object on the server, in hydration and after. */
const startStates = new WeakMap<WorkspaceStart, WorkspaceState>();
/** Server renders this tab has shown; the router can hand an old one in again (back and forward). */
const shown = new WeakSet<WorkspaceStart>();
/** Settles once this tab first connects: images asked for in hydration wait for it. */
let markConnected: () => void = () => {};
const firstConnection = new Promise<void>((resolve) => {
  markConnected = resolve;
});

function emit(): void {
  for (const listener of listeners) listener();
}

function setData(data: SquintData): void {
  state = { status: "ready", data };
  emit();
}

function fail(reason: WorkspaceFailure): void {
  state = { status: "error", reason };
  emit();
}

function notice(message: string): void {
  const now = Date.now();
  if (lastNotice.message === message && now - lastNotice.at < NOTICE_REPEAT_MS) return;
  lastNotice = { message, at: now };
  for (const listener of noticeListeners) listener(message);
}

const base = (workspaceId: string) => `/api/w/${encodeURIComponent(workspaceId)}`;

/** The project a logical blob key belongs to, in the loaded data. */
function locate(key: string): string | null {
  if (state.status !== "ready") return null;
  const { data } = state;
  const page = data.projects.find(
    (project) =>
      project.source.kind === "pages" && project.source.pages.some((p) => p.blobKey === key),
  );
  return (
    page?.id ??
    data.snapshots.find((snapshot) => snapshot.blobKey === key)?.projectId ??
    data.comments.find((comment) => comment.crop?.blobKey === key)?.projectId ??
    null
  );
}

async function send(workspaceId: string, write: ServerWrite) {
  return call(`${base(workspaceId)}${write.path}`, jsonInit(write.method, write.body));
}

/** Undoes a refused action if nothing changed since; either way the next read settles it. */
function rollBack(job: Job): void {
  if (state.status === "ready" && state.data === job.after) setData(job.before);
  void refreshWorkspace();
}

async function run(target: Connection, job: Job): Promise<Result> {
  for (const write of job.writes) {
    const result = await send(target.workspaceId, write);
    if (connection !== target) return { ok: false, error: UNAVAILABLE };
    if (result.ok || write.tolerate?.includes(result.status)) continue;
    if (result.status === 401) {
      fail("signed-out");
      return { ok: false, error: UNAVAILABLE };
    }
    const error = refusalMessage(job.action, result.status);
    rollBack(job);
    emitSquiggy({ type: "save-failed" });
    if (!job.quiet) notice(error);
    return { ok: false, error };
  }
  if (job.writes.length > 0) {
    lastSavedAt = Date.now();
    target.tabs.announce();
  }
  return OK;
}

function enqueue(job: Job): Promise<Result> {
  const target = connection;
  if (!target || job.writes.length === 0) return Promise.resolve(OK);
  pending += 1;
  const outcome = queue.then(() => run(target, job));
  queue = outcome
    .catch(() => undefined)
    .finally(() => {
      pending -= 1;
    });
  return outcome;
}

/** Applies `action` here at once and queues its requests; the promise settles with the server's answer. */
function apply(action: Action, quiet: boolean): { now: Result; saved: Promise<Result> } {
  if (state.status !== "ready") {
    const refused: Result = { ok: false, error: UNAVAILABLE };
    return { now: refused, saved: Promise.resolve(refused) };
  }
  const before = state.data;
  const after = reduce(before, action);
  if (after === before) return { now: OK, saved: Promise.resolve(OK) };
  changes += 1;
  if (action.type === "project/share") connection?.links.set(action.share.id, action.share);
  setData(after);
  const writes = writesFor(action, before, after);
  return { now: OK, saved: enqueue({ action, before, after, writes, quiet }) };
}

/** Applies an action now; if the server refuses it, it's rolled back with a notice. */
export function dispatchToWorkspace(action: Action): Result {
  return apply(action, false).now;
}

/** Applies an action now and resolves once the server has it; the caller reports a refusal. */
export function dispatchSaved(action: Action): Promise<Result> {
  return apply(action, true).saved;
}

/** Resolves once every request queued so far has been answered. */
export function whenSaved(): Promise<void> {
  return queue.then(() => undefined);
}

function fileProjects(): void {
  if (state.status !== "ready") return;
  for (const action of fileOrphans(state.data, Date.now())) dispatchToWorkspace(action);
}

/** Fetches the secrets of review links this tab hasn't seen (made in another tab). */
async function fetchLinks(target: Connection, data: WorkspaceData): Promise<void> {
  const missing = projectsMissingLinks(data, target.links);
  const fetched = await Promise.all(
    missing.map((projectId) =>
      call<ShareLink>(
        `${base(target.workspaceId)}/projects/${encodeURIComponent(projectId)}/share-link`,
      ),
    ),
  );
  for (const result of fetched) if (result.ok) target.links.set(result.value.id, result.value);
}

async function read(target: Connection): Promise<void> {
  const seen = changes;
  const result = await call<WorkspaceData>(`${base(target.workspaceId)}/snapshot`);
  if (connection !== target) return;
  if (!result.ok) {
    // Offline or a server error: keep what's shown; the next focus reads again.
    if (result.status === 401) fail("signed-out");
    else if (result.status === 404) fail("gone");
    return;
  }
  await fetchLinks(target, result.value);
  if (connection !== target) return;
  // A read that works after an error means the session is back (signed in again): show it.
  if (state.status !== "error" && (pending > 0 || changes !== seen)) {
    // A change of this tab's is newer than what was read: read again once it's saved.
    readAgain = true;
    return;
  }
  // A server without the summary yet (mid-deploy) has none to give.
  clientActivity = result.value.clientActivity ?? [];
  setData(toSquintData(result.value, target.links));
  target.blobs.retryMissing();
  fileProjects();
}

/**
 * Reads the workspace from the server again and shows it, unless this tab
 * changed something meanwhile (then it reads again once that's saved).
 */
export function refreshWorkspace(): Promise<void> {
  const target = connection;
  if (!target) return Promise.resolve();
  if (reading) {
    readAgain = true;
    return reading;
  }
  reading = read(target)
    .catch(() => undefined)
    .finally(() => {
      reading = null;
      if (!readAgain) return;
      readAgain = false;
      void whenSaved().then(refreshWorkspace);
    });
  return reading;
}

/**
 * The state a server render shows, before any tab has connected: what the
 * server and the first client render show (`useSquint`), so neither waits
 * on a loading state. The same object every time for the same render.
 */
export function startState(start: WorkspaceStart): WorkspaceState {
  let found = startStates.get(start);
  if (!found) {
    const links = new Map(start.links.map((link) => [link.id, link]));
    found = { status: "ready", data: toSquintData(start.data, links) };
    startStates.set(start, found);
  }
  return found;
}

/** Shows a server render on `target`, taking in its review links. */
function adopt(target: Connection, start: WorkspaceStart): void {
  for (const link of start.links) target.links.set(link.id, link);
  changes += 1;
  clientActivity = start.data.clientActivity;
  state = startState(start);
  emit();
  target.blobs.retryMissing();
  fileProjects();
}

/**
 * Starts this tab on the workspace the server rendered, or moves it on to a
 * newer render of it (the dashboard to the viewer, or back from signing in
 * again), so the page doesn't read it a second time. Keeps what's here
 * instead, and reads the server again, when the render may be older: one
 * shown before (restored by back or forward), or one rendered while this
 * tab's changes were on their way. After an error, a new render always wins.
 */
export function connectWorkspace(start: WorkspaceStart): void {
  const { workspace } = start.data;
  const fresh = !shown.has(start);
  shown.add(start);
  if (connection?.workspaceId === workspace.id) {
    const saving = pending > 0 || Date.now() - lastSavedAt < RECENT_SAVE_MS;
    if (!fresh) void refreshWorkspace();
    else if (state.status !== "error" && saving) void whenSaved().then(refreshWorkspace);
    else adopt(connection, start);
    return;
  }
  connection?.tabs.close();
  connection = {
    workspaceId: workspace.id,
    blobs: createWorkspaceBlobs(workspace.id, locate),
    tabs: openTabSync(workspace.id, () => void refreshWorkspace()),
    links: new Map(),
  };
  adopt(connection, start);
  markConnected();
}

export function getWorkspaceState(): WorkspaceState {
  return state;
}

/**
 * Clients' comments per project (`ClientCommentActivity`), as of the server's
 * last read; null before this tab connects. Changes notify `subscribeWorkspace`.
 */
export function getClientActivity(): readonly ClientCommentActivity[] | null {
  return clientActivity;
}

export function subscribeWorkspace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Refusals of changes nobody waited for, to show as a toast. */
export function subscribeNotices(listener: (message: string) => void): () => void {
  noticeListeners.add(listener);
  return () => noticeListeners.delete(listener);
}

/** The connected workspace's id; null before the first signed-in page. */
export function connectedWorkspaceId(): string | null {
  return connection?.workspaceId ?? null;
}

/** The connected workspace's images; null before the first signed-in page. */
export function workspaceBlobs(): WorkspaceBlobs | null {
  return connection?.blobs ?? null;
}

/** The connected workspace's images, once this tab has connected. */
export async function connectedBlobs(): Promise<WorkspaceBlobs> {
  await firstConnection;
  const blobs = workspaceBlobs();
  if (!blobs) throw new Error("Connected without images.");
  return blobs;
}
