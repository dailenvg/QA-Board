import { BlobStoreUnavailable } from "../blob-store/blob-store";
import { MB } from "../share/limits";
import { sniffImageType } from "../share/sniff";
import type { ApiResult } from "../share-client/api";
import type { PendingImage } from "../store/persist";
import type { Comment, Folder, Project, Snapshot, SquintData } from "../store/types";
import type { ImportResult } from "../workspace/import-data";
import type { ImportData } from "../workspace/schemas";
import type { UploadResult } from "./blob-upload";

/**
 * The one-shot import of what an earlier build kept in this browser into the
 * signed-in workspace. Folders go first, then projects in batches small
 * enough for the import route, each project whole with its snapshots and
 * comments; then every file the server says it still lacks is uploaded. The
 * browser's copy is cleared only once every project is in the workspace and
 * every file it could send arrived. Safe to run again after a failure: the
 * server skips what it already has and lists only the files still missing.
 */

/** Under the import route's 4 MB body limit, with room for the request's wrapper. */
export const IMPORT_BATCH_BYTES = 3.5 * MB;
/** Files uploaded at once. */
const FILE_CONCURRENCY = 3;

/** What the browser kept: its data, and version 1 images still inline (`local-store.ts`). */
export interface LocalImport {
  data: SquintData;
  pendingImages: readonly PendingImage[];
}

/**
 * Why something didn't come in. Only `link-lost`, `file-missing` and
 * `no-surface` let the browser's copy go: keeping it couldn't bring those back.
 */
export type SkipReason =
  /** The project's id belongs to another workspace (409). */
  | "other-workspace"
  /** The server can't accept the project's data (400). */
  | "refused"
  /** The project alone is over the import route's size limit. */
  | "too-large"
  /** The project's folder didn't come in. */
  | "no-folder"
  /** An earlier import brought it in, and it's in the trash now: its images can't be added. */
  | "in-trash"
  /** Imported without its review link: the link expired or was revoked. */
  | "link-lost"
  /** This browser no longer has the image. */
  | "file-missing"
  /** The workspace refused the image (too big, or not an image). */
  | "file-refused"
  /** Comments on a page or snapshot this browser no longer has. */
  | "no-surface";

export interface SkippedItem {
  kind: "project" | "file" | "comments";
  projectName: string;
  reason: SkipReason;
  /** How many, for `comments`. */
  count?: number;
}

const LETS_LOCAL_GO: ReadonlySet<SkipReason> = new Set(["link-lost", "file-missing", "no-surface"]);

/** Whether a skipped item means the browser must keep its copy. */
export const keepsLocalCopy = (item: SkippedItem): boolean => !LETS_LOCAL_GO.has(item.reason);

export interface ImportReport {
  /** Projects of this browser now in the workspace (imported now or earlier). */
  projects: number;
  comments: number;
  files: number;
  skipped: SkippedItem[];
  /** True once this browser's copy was cleared: nothing it holds is missing from the workspace. */
  cleared: boolean;
  /**
   * True when this run brought something new into the workspace (a folder, a
   * project or an image); false when an earlier run had already moved it all.
   */
  moved: boolean;
}

/** Why an import stopped; this browser's copy is untouched, and running it again picks up from here. */
export type ImportFailure =
  | "offline"
  | "signed-out"
  | "storage-full"
  | "server"
  /** An image couldn't be read from this browser's image store. */
  | "local-files"
  /** The browser won't open its image store at all (a private window): retrying here can't help. */
  | "images-blocked"
  /** The server can't accept the folders: retrying can't help. */
  | "folders";

/** Failures a Retry in this same window can't get past. */
export const RETRY_WONT_HELP: ReadonlySet<ImportFailure> = new Set(["images-blocked", "folders"]);

export interface ImportProgress {
  stage: "projects" | "files";
  done: number;
  total: number;
}

export type ImportOutcome =
  { ok: true; report: ImportReport } | { ok: false; failure: ImportFailure };

export interface ImportDeps {
  send: (body: ImportData) => Promise<ApiResult<ImportResult>>;
  upload: (projectId: string, key: string, blob: Blob) => Promise<UploadResult>;
  /** The image under `key`, or null when this browser has none; throws when it can't be read. */
  readFile: (key: string) => Promise<Blob | null>;
  clear: () => Promise<void>;
  onProgress?: (progress: ImportProgress) => void;
}

/** A project with everything that hangs off it, as the import route takes it. */
interface Bundle {
  project: ImportData["projects"][number];
  snapshots: ImportData["snapshots"];
  comments: ImportData["comments"];
  bytes: number;
}

const encoder = new TextEncoder();
const byteLength = (value: unknown) => encoder.encode(JSON.stringify(value)).length;

const toFolder = ({ id, name, createdAt, parentId }: Folder) => ({ id, name, createdAt, parentId });

function toProject({ id, folderId, name, source, createdAt, updatedAt, share }: Project) {
  const link = share && {
    id: share.id,
    token: share.token,
    ownerKey: share.ownerKey,
    createdAt: share.createdAt,
    cursor: share.cursor,
    lastSyncedAt: share.lastSyncedAt,
  };
  return { id, folderId, name, source, createdAt, updatedAt, share: link };
}

const toSnapshot = (snapshot: Snapshot) => ({
  id: snapshot.id,
  projectId: snapshot.projectId,
  width: snapshot.width,
  height: snapshot.height,
  createdAt: snapshot.createdAt,
  blobKey: snapshot.blobKey,
  sourceUrl: snapshot.sourceUrl,
  scale: snapshot.scale,
});

const toComment = (comment: Comment) => ({
  id: comment.id,
  projectId: comment.projectId,
  x: comment.x,
  y: comment.y,
  body: comment.body,
  author: comment.author,
  status: comment.status,
  createdAt: comment.createdAt,
  updatedAt: comment.updatedAt,
  resolvedAt: comment.resolvedAt,
  snapshotId: comment.snapshotId,
  pageId: comment.pageId,
  crop: comment.crop,
  fromClient: comment.fromClient,
});

/** Each project with its snapshots and comments, and how many bytes it adds to a request. */
export function bundleProjects(data: SquintData): Bundle[] {
  return data.projects.map((project) => {
    const bundle = {
      project: toProject(project),
      snapshots: data.snapshots.filter((s) => s.projectId === project.id).map(toSnapshot),
      comments: data.comments.filter((c) => c.projectId === project.id).map(toComment),
    };
    return { ...bundle, bytes: byteLength(bundle) };
  });
}

/**
 * Bundles packed in order into batches of at most `budget` bytes. A bundle
 * over the budget on its own can't be sent: it's returned apart.
 */
export function planBatches(
  bundles: readonly Bundle[],
  budget: number = IMPORT_BATCH_BYTES,
): { batches: Bundle[][]; oversized: Bundle[] } {
  const batches: Bundle[][] = [];
  const oversized: Bundle[] = [];
  let current: Bundle[] = [];
  let size = 0;
  for (const bundle of bundles) {
    if (bundle.bytes > budget) {
      oversized.push(bundle);
      continue;
    }
    if (current.length > 0 && size + bundle.bytes > budget) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(bundle);
    size += bundle.bytes;
  }
  if (current.length > 0) batches.push(current);
  return { batches, oversized };
}

function requestOf(
  batch: readonly Bundle[],
  authorName: string | null,
  folders: ImportData["folders"] = [],
): ImportData {
  return {
    folders,
    projects: batch.map((bundle) => bundle.project),
    snapshots: batch.flatMap((bundle) => bundle.snapshots),
    comments: batch.flatMap((bundle) => bundle.comments),
    authorName,
  };
}

function failureOf(result: { status: number; error: string }): ImportFailure {
  if (result.status === 0) return "offline";
  if (result.status === 401) return "signed-out";
  if (result.status === 413 && result.error === "quota") return "storage-full";
  return "server";
}

/** A refusal that's about this batch's data, not the connection: worth splitting, or skipping. */
function projectRefusal(result: { status: number; error: string }): SkipReason | null {
  if (result.status === 409) return "other-workspace";
  if (result.status === 400) return "refused";
  if (result.status === 413 && result.error !== "quota") return "too-large";
  return null;
}

/** A refusal of one file that a retry wouldn't change. */
function fileRefused(result: { status: number; error: string }): boolean {
  return (
    result.status === 400 ||
    result.status === 404 ||
    result.status === 415 ||
    (result.status === 413 && result.error !== "quota")
  );
}

/** The comments the server keeps: on no surface, or on a page or snapshot that came in too. */
function placed(comment: Comment, project: Project, snapshotIds: ReadonlySet<string>): boolean {
  const pages = project.source.kind === "pages" ? project.source.pages : [];
  return (
    (!comment.snapshotId || snapshotIds.has(`${project.id}/${comment.snapshotId}`)) &&
    (!comment.pageId || pages.some((page) => page.id === comment.pageId))
  );
}

/** Every file key a project points at. */
function filesOf(project: Project, data: SquintData): Set<string> {
  const keys = new Set<string>();
  if (project.source.kind === "pages")
    for (const page of project.source.pages) keys.add(page.blobKey);
  for (const snapshot of data.snapshots)
    if (snapshot.projectId === project.id) keys.add(snapshot.blobKey);
  for (const comment of data.comments)
    if (comment.projectId === project.id && comment.crop) keys.add(comment.crop.blobKey);
  return keys;
}

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** `blob` with its image type, read from its bytes when the stored type is missing; null if it isn't an image. */
async function asImage(blob: Blob): Promise<Blob | null> {
  if (IMAGE_TYPES.has(blob.type)) return blob;
  const type = sniffImageType(new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
  return type ? new Blob([blob], { type }) : null;
}

/** A version 1 image, inline as a base64 data URL; null when it isn't one. */
function inlineImage(dataUrl: string): Blob | null {
  const match = /^data:([^;,]*);base64,(.*)$/s.exec(dataUrl);
  if (!match?.[2]) return null;
  try {
    const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: match[1] ?? "" });
  } catch {
    return null;
  }
}

/** Collects the import's results as it goes. */
class Tally {
  readonly present = new Set<string>();
  readonly skipped: SkippedItem[] = [];
  readonly uploads = new Map<string, { projectId: string; key: string }>();
  readonly missing = new Set<string>();
  readonly refused = new Set<string>();
  /** Whether anything new reached the workspace in this run. */
  moved = false;

  constructor(private readonly names: ReadonlyMap<string, string>) {}

  name(projectId: string): string {
    return this.names.get(projectId) ?? projectId;
  }

  skipProject(projectId: string, reason: SkipReason): void {
    this.skipped.push({ kind: "project", projectName: this.name(projectId), reason });
  }

  skipFile(projectId: string, key: string, reason: "file-missing" | "file-refused"): void {
    (reason === "file-missing" ? this.missing : this.refused).add(`${projectId}/${key}`);
    this.skipped.push({ kind: "file", projectName: this.name(projectId), reason });
  }

  took(batch: readonly Bundle[], result: ImportResult): void {
    const { imported, existing, trashed, unlinked } = result.projects;
    if (imported.length > 0) this.moved = true;
    for (const id of [...imported, ...existing]) this.present.add(id);
    for (const id of trashed) this.skipProject(id, "in-trash");
    for (const { project } of batch)
      if (!this.present.has(project.id) && !trashed.includes(project.id))
        this.skipProject(project.id, "no-folder");
    for (const id of unlinked) this.skipProject(id, "link-lost");
    for (const upload of result.uploads)
      this.uploads.set(`${upload.projectId}/${upload.key}`, upload);
  }
}

/** Sends every batch, splitting one the server refuses to find the project it refuses. */
async function sendProjects(
  batches: Bundle[][],
  local: LocalImport,
  deps: ImportDeps,
  tally: Tally,
): Promise<ImportFailure | null> {
  const queue = [...batches];
  const total = local.data.projects.length;
  let done = total - batches.reduce((sum, batch) => sum + batch.length, 0);
  deps.onProgress?.({ stage: "projects", done, total });
  for (let batch = queue.shift(); batch; batch = queue.shift()) {
    const result = await deps.send(requestOf(batch, local.data.authorName));
    if (result.ok) {
      tally.took(batch, result.value);
      done += batch.length;
      deps.onProgress?.({ stage: "projects", done, total });
      continue;
    }
    const reason = projectRefusal(result);
    if (!reason) return failureOf(result);
    if (batch.length > 1) {
      const half = Math.ceil(batch.length / 2);
      queue.unshift(batch.slice(0, half), batch.slice(half));
      continue;
    }
    for (const { project } of batch) tally.skipProject(project.id, reason);
    done += 1;
    deps.onProgress?.({ stage: "projects", done, total });
  }
  return null;
}

/** Uploads every file the server listed, a few at a time; stops at the first failure a retry could fix. */
async function sendFiles(local: LocalImport, deps: ImportDeps, tally: Tally) {
  const files = [...tally.uploads.values()];
  const pending = new Map(local.pendingImages.map((image) => [image.key, image.dataUrl]));
  let next = 0;
  let done = 0;
  let failure: ImportFailure | null = null;
  deps.onProgress?.({ stage: "files", done, total: files.length });

  const read = (key: string): Promise<Blob | null> => {
    const inline = pending.get(key);
    return inline ? Promise.resolve(inlineImage(inline)) : deps.readFile(key);
  };

  const send = async ({ projectId, key }: { projectId: string; key: string }) => {
    let stored: Blob | null;
    try {
      stored = await read(key);
    } catch (error) {
      failure ??= error instanceof BlobStoreUnavailable ? "images-blocked" : "local-files";
      return;
    }
    if (!stored) return tally.skipFile(projectId, key, "file-missing");
    const image = await asImage(stored);
    if (!image) return tally.skipFile(projectId, key, "file-refused");
    const result = await deps.upload(projectId, key, image);
    if (result.ok) {
      tally.moved = true;
      return;
    }
    if (fileRefused(result)) return tally.skipFile(projectId, key, "file-refused");
    failure ??= failureOf(result);
  };

  const worker = async () => {
    while (!failure && next < files.length) {
      const file = files[next];
      next += 1;
      if (!file) break;
      await send(file);
      if (failure) break;
      done += 1;
      deps.onProgress?.({ stage: "files", done, total: files.length });
    }
  };
  await Promise.all(Array.from({ length: FILE_CONCURRENCY }, worker));
  return failure;
}

/** Counts what's now in the workspace, from this browser's side, and the comments that couldn't come. */
function report(local: LocalImport, tally: Tally): Omit<ImportReport, "cleared" | "moved"> {
  const { data } = local;
  const snapshotIds = new Set(data.snapshots.map((s) => `${s.projectId}/${s.id}`));
  let comments = 0;
  let files = 0;
  for (const project of data.projects) {
    if (!tally.present.has(project.id)) continue;
    const own = data.comments.filter((comment) => comment.projectId === project.id);
    const kept = own.filter((comment) => placed(comment, project, snapshotIds)).length;
    comments += kept;
    if (kept < own.length) {
      tally.skipped.push({
        kind: "comments",
        projectName: project.name,
        reason: "no-surface",
        count: own.length - kept,
      });
    }
    for (const key of filesOf(project, data)) {
      const id = `${project.id}/${key}`;
      if (!tally.missing.has(id) && !tally.refused.has(id)) files += 1;
    }
  }
  return { projects: tally.present.size, comments, files, skipped: tally.skipped };
}

/**
 * Imports this browser's data into the workspace `deps` talks to. Resolves
 * with what came in and what was skipped (clearing the browser's copy when
 * nothing it holds is missing from the workspace), or with why it stopped.
 * Never throws for a refusal or a failed request; never clears on a failure.
 */
export async function importLocalData(
  local: LocalImport,
  deps: ImportDeps,
): Promise<ImportOutcome> {
  const { data } = local;
  const tally = new Tally(new Map(data.projects.map((project) => [project.id, project.name])));
  if (data.folders.length > 0) {
    const folders = await deps.send(requestOf([], data.authorName, data.folders.map(toFolder)));
    if (!folders.ok) {
      const refused =
        folders.status === 400 || (folders.status === 413 && folders.error !== "quota");
      return { ok: false, failure: refused ? "folders" : failureOf(folders) };
    }
    if (folders.value.imported.folders > 0) tally.moved = true;
  }
  const { batches, oversized } = planBatches(bundleProjects(data));
  for (const { project } of oversized) tally.skipProject(project.id, "too-large");

  const stopped =
    (await sendProjects(batches, local, deps, tally)) ?? (await sendFiles(local, deps, tally));
  if (stopped) return { ok: false, failure: stopped };

  const counts = report(local, tally);
  const cleared = !counts.skipped.some(keepsLocalCopy);
  if (cleared) await deps.clear();
  return { ok: true, report: { ...counts, cleared, moved: tally.moved } };
}
