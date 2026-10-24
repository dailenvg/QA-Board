import type {
  Comment,
  CommentCrop,
  Folder,
  Project,
  ProjectSource,
  Rect,
  Snapshot,
  SquintData,
} from "./types";

export const STORAGE_KEY = "squint:v1";
export const DEFAULT_FOLDER_NAME = "My projects";

export type ParseResult =
  { ok: true; data: SquintData; repaired: boolean } | { ok: false; reason: string };

type Guard<T> = (value: unknown) => value is T;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const isPercent = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;

const isSize = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isFolder: Guard<Folder> = (value): value is Folder =>
  isRecord(value) && isString(value.id) && isString(value.name) && isTime(value.createdAt);

const isSource: Guard<ProjectSource> = (value): value is ProjectSource => {
  if (!isRecord(value)) return false;
  if (value.kind === "url") return isString(value.url);
  return (
    value.kind === "image" &&
    isString(value.dataUrl) &&
    value.dataUrl.startsWith("data:image/") &&
    isString(value.fileName) &&
    (value.referenceUrl === undefined || isString(value.referenceUrl))
  );
};

const isProject: Guard<Project> = (value): value is Project =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.folderId) &&
  isString(value.name) &&
  isSource(value.source) &&
  isTime(value.createdAt) &&
  isTime(value.updatedAt);

const isComment: Guard<Comment> = (value): value is Comment =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.projectId) &&
  isPercent(value.x) &&
  isPercent(value.y) &&
  isString(value.body) &&
  isString(value.author) &&
  (value.status === "active" || value.status === "resolved") &&
  isTime(value.createdAt) &&
  isTime(value.updatedAt) &&
  (value.resolvedAt === undefined || isTime(value.resolvedAt)) &&
  (value.snapshotId === undefined || isString(value.snapshotId));

const isRect: Guard<Rect> = (value): value is Rect =>
  isRecord(value) &&
  isTime(value.x) &&
  isTime(value.y) &&
  isSize(value.width) &&
  isSize(value.height);

const isCrop: Guard<CommentCrop> = (value): value is CommentCrop =>
  isRecord(value) && isString(value.blobKey) && isRect(value.rect);

const isSnapshot: Guard<Snapshot> = (value): value is Snapshot =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.projectId) &&
  isSize(value.width) &&
  isSize(value.height) &&
  isTime(value.createdAt) &&
  isString(value.blobKey) &&
  isString(value.sourceUrl);

function listOf<T>(value: unknown, guard: Guard<T>): T[] | null {
  return Array.isArray(value) && value.every(guard) ? value : null;
}

export function createInitialData(folderId: string, now: number): SquintData {
  return {
    version: 1,
    folders: [{ id: folderId, name: DEFAULT_FOLDER_NAME, createdAt: now }],
    projects: [],
    comments: [],
    snapshots: [],
    authorName: null,
  };
}

/** Only http(s) URLs ever reach an iframe `src` or a link `href`. */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Keeps a project's source safe to render, or returns null when it can't be. */
function safeSource(source: ProjectSource): ProjectSource | null {
  if (source.kind === "url") return isHttpUrl(source.url) ? source : null;
  if (source.referenceUrl === undefined || isHttpUrl(source.referenceUrl)) return source;
  const { referenceUrl: _unsafe, ...image } = source;
  return image;
}

/** Drops a crop that isn't readable; the comment itself stays. */
function withSafeCrop(comment: Comment): Comment {
  if (comment.crop === undefined || isCrop(comment.crop)) return comment;
  const { crop: _unreadable, ...rest } = comment;
  return rest;
}

/** Snapshots were added later, so they're read leniently: unreadable ones are skipped. */
function readSnapshots(value: unknown): { snapshots: Snapshot[]; repaired: boolean } {
  if (value === undefined) return { snapshots: [], repaired: false };
  if (!Array.isArray(value)) return { snapshots: [], repaired: true };
  const snapshots = value.filter(isSnapshot);
  return { snapshots, repaired: snapshots.length !== value.length };
}

/**
 * Repairs instead of failing: projects without a folder move to the first
 * folder, website projects whose address isn't http(s) are dropped (an image's
 * bad reference link is removed instead), comments and snapshots without a
 * project are dropped, and unreadable crops are removed from their comments.
 */
function repair(data: SquintData): { data: SquintData; repaired: boolean } {
  const folderIds = new Set(data.folders.map((folder) => folder.id));
  const fallback = data.folders[0]?.id;
  let repaired = false;
  const projects = data.projects.flatMap((project) => {
    const source = safeSource(project.source);
    if (!source) {
      repaired = true;
      return [];
    }
    if (source !== project.source) repaired = true;
    const folderId = folderIds.has(project.folderId) || !fallback ? project.folderId : fallback;
    if (folderId !== project.folderId) repaired = true;
    return source === project.source && folderId === project.folderId
      ? [project]
      : [{ ...project, source, folderId }];
  });
  const projectIds = new Set(projects.map((project) => project.id));
  const kept = data.comments.filter((comment) => projectIds.has(comment.projectId));
  const comments = kept.map(withSafeCrop);
  if (kept.length !== data.comments.length || comments.some((c, i) => c !== kept[i])) {
    repaired = true;
  }
  const snapshots = data.snapshots.filter((snapshot) => projectIds.has(snapshot.projectId));
  if (snapshots.length !== data.snapshots.length) repaired = true;
  return { data: { ...data, projects, comments, snapshots }, repaired };
}

/** Defensive parse of the stored JSON. Never throws. */
export function parseData(raw: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "The saved data isn't valid JSON." };
  }
  if (!isRecord(value) || value.version !== 1) {
    return { ok: false, reason: "The saved data is from an unknown version." };
  }
  const folders = listOf(value.folders, isFolder);
  const projects = listOf(value.projects, isProject);
  const comments = listOf(value.comments, isComment);
  if (!folders || folders.length === 0 || !projects || !comments) {
    return { ok: false, reason: "The saved data is incomplete or damaged." };
  }
  const authorName = isString(value.authorName) ? value.authorName : null;
  const read = readSnapshots(value.snapshots);
  const result = repair({
    version: 1,
    folders,
    projects,
    comments,
    snapshots: read.snapshots,
    authorName,
  });
  return { ok: true, data: result.data, repaired: result.repaired || read.repaired };
}

export function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22 ||
      error.code === 1014)
  );
}
