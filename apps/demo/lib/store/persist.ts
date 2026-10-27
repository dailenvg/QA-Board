import { projectImageKey } from "../blob-store/keys";
import { MIGRATED_PAGE_ID, placeComment } from "./pages";
import type {
  Comment,
  CommentCrop,
  Folder,
  Page,
  PagesSource,
  PendingRevocation,
  Project,
  ProjectShare,
  ProjectSource,
  Rect,
  Snapshot,
  SquintData,
} from "./types";

/** Where Squint keeps its data. Version 3 added pages and nested folders. */
export const STORAGE_KEY = "squint:v3";
/**
 * Earlier versions, newest first: read once when there's no version 3 copy,
 * migrated, and removed after the version 3 copy is saved (older Squint
 * builds can't read version 3 data). A failed migration leaves them as they are.
 */
export const LEGACY_STORAGE_KEYS = ["squint:v2", "squint:v1"] as const;
/**
 * The name load repair gives the folder it makes for projects left without one
 * when no folder exists. It's also the name of the empty folder every new
 * browser got before fresh workspaces started with no folders (`legacy-folder.ts`).
 */
export const DEFAULT_FOLDER_NAME = "My projects";
const RECOVERED_FOLDER_ID = "default";

/** An image that was inline in version 1 data and still has to reach the blob store. */
export interface PendingImage {
  key: string;
  dataUrl: string;
}

export type ParseResult =
  | {
      ok: true;
      data: SquintData;
      repaired: boolean;
      pendingImages: PendingImage[];
      /** The version the data was saved as; anything below 3 still has to be saved as 3. */
      storedVersion: 1 | 2 | 3;
    }
  | { ok: false; reason: string };

/** A version 1 image source: the picture inline as a data URL. */
interface InlineImageSource {
  kind: "image";
  dataUrl: string;
  fileName: string;
  referenceUrl?: string;
}

/** A version 2 image source: one picture in the blob store. */
interface StoredImageSource {
  kind: "image";
  blobKey: string;
  fileName: string;
  referenceUrl?: string;
}

type StoredSource = ProjectSource | InlineImageSource | StoredImageSource;
type StoredProject = Omit<Project, "source"> & { source: StoredSource };
/** Folders before version 3 had no parent. */
type StoredFolder = Omit<Folder, "parentId"> & { parentId?: string | null };

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

const isOptionalString = (value: unknown) => value === undefined || isString(value);

const isFolder: Guard<StoredFolder> = (value): value is StoredFolder =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isTime(value.createdAt) &&
  (value.parentId === undefined || value.parentId === null || isString(value.parentId));

const isRevision = (value: unknown): boolean =>
  value === undefined || (Number.isSafeInteger(value) && Number(value) > 0);

/** Width and height come together, or not at all. */
const isPage: Guard<Page> = (value): value is Page =>
  isRecord(value) &&
  isString(value.id) &&
  value.id.length > 0 &&
  isString(value.blobKey) &&
  isString(value.name) &&
  (value.width === undefined
    ? value.height === undefined
    : isSize(value.width) && isSize(value.height)) &&
  isRevision(value.rev);

/** At least one page, each id once. */
function isPageList(value: unknown): value is Page[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isPage)) return false;
  return new Set(value.map((page) => page.id)).size === value.length;
}

const isPagesSource = (value: Record<string, unknown>): boolean =>
  (value.origin === "image" || value.origin === "pdf") && isPageList(value.pages);

const isSource: Guard<StoredSource> = (value): value is StoredSource => {
  if (!isRecord(value)) return false;
  if (value.kind === "url") return isString(value.url);
  if (!isString(value.fileName) || !isOptionalString(value.referenceUrl)) return false;
  if (value.kind === "pages") return isPagesSource(value);
  const picture =
    isString(value.blobKey) || (isString(value.dataUrl) && value.dataUrl.startsWith("data:image/"));
  return value.kind === "image" && picture;
};

const isShare: Guard<ProjectShare> = (value): value is ProjectShare =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.token) &&
  isString(value.ownerKey) &&
  isTime(value.createdAt) &&
  isTime(value.cursor) &&
  (value.lastSyncedAt === undefined || isTime(value.lastSyncedAt));

const isProject: Guard<StoredProject> = (value): value is StoredProject =>
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
  isOptionalString(value.snapshotId) &&
  isOptionalString(value.pageId);

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
  isString(value.sourceUrl) &&
  (value.scale === undefined || (isSize(value.scale) && value.scale <= 1));

const isRevocation: Guard<PendingRevocation> = (value): value is PendingRevocation =>
  isRecord(value) &&
  isString(value.shareId) &&
  isString(value.ownerKey) &&
  isString(value.projectId) &&
  isTime(value.dueAt);

/** Read leniently, like snapshots: a missing list is empty, unreadable entries are skipped. */
function readRevocations(value: unknown): PendingRevocation[] {
  return Array.isArray(value) ? value.filter(isRevocation) : [];
}

function listOf<T>(value: unknown, guard: Guard<T>): T[] | null {
  return Array.isArray(value) && value.every(guard) ? value : null;
}

/** A fresh workspace: no folders yet, so the person names their first one. */
export function createInitialData(): SquintData {
  return {
    version: 3,
    folders: [],
    projects: [],
    comments: [],
    snapshots: [],
    revocations: [],
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
  const { referenceUrl: _unsafe, ...pages } = source;
  return pages;
}

/** Drops share details that aren't readable; the project stays, no longer shared here. */
function withSafeShare<T extends { share?: unknown }>(project: T): T {
  if (project.share === undefined || isShare(project.share)) return project;
  const { share: _unreadable, ...rest } = project;
  return rest as T;
}

/** A version 2 image as a one-page project, its picture where it already is (no copy). */
function toPages(source: StoredImageSource): PagesSource {
  const { blobKey, fileName, referenceUrl } = source;
  return {
    kind: "pages",
    origin: "image",
    pages: [{ id: MIGRATED_PAGE_ID, blobKey, name: fileName }],
    fileName,
    ...(referenceUrl === undefined ? {} : { referenceUrl }),
  };
}

/**
 * Brings a stored project to version 3. A version 1 inline image moves out
 * (into `pending`, under `image:<projectId>`) and the project keeps its key;
 * an image project then becomes a project with that one page.
 */
function upgradeProject(stored: StoredProject, pending: PendingImage[]): Project {
  const project = withSafeShare(stored);
  const { source } = project;
  if (source.kind !== "image") return { ...project, source };
  if ("blobKey" in source) return { ...project, source: toPages(source) };
  const blobKey = projectImageKey(project.id);
  pending.push({ key: blobKey, dataUrl: source.dataUrl });
  const { dataUrl: _inline, ...rest } = source;
  return { ...project, source: toPages({ ...rest, blobKey }) };
}

/** Before version 3 folders didn't nest: every folder is at the top level. */
function upgradeFolder(folder: StoredFolder): Folder {
  return { ...folder, parentId: folder.parentId ?? null };
}

/** Version 1 and 2 comments on an image now sit on its one page. */
function upgradeComments(comments: readonly Comment[], projects: readonly Project[]): Comment[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  return comments.map((comment) => {
    const project = byId.get(comment.projectId);
    return project ? placeComment(comment, project) : comment;
  });
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
 * Moves folders whose parent is unknown to the top level, and breaks every
 * cycle (a folder inside itself, directly or further down) at the folder
 * that closes it. Earlier folders in the list keep their place first.
 */
function repairFolderTree(folders: readonly Folder[]): Folder[] {
  const parents = new Map(folders.map((folder) => [folder.id, folder.parentId]));
  for (const folder of folders) {
    const chain = new Set([folder.id]);
    let child = folder.id;
    let parent = parents.get(child) ?? null;
    while (parent !== null) {
      if (!parents.has(parent) || chain.has(parent)) {
        parents.set(child, null);
        break;
      }
      chain.add(parent);
      child = parent;
      parent = parents.get(child) ?? null;
    }
  }
  return folders.map((folder) => {
    const parentId = parents.get(folder.id) ?? null;
    return parentId === folder.parentId ? folder : { ...folder, parentId };
  });
}

/** Keeps comments readable and on a surface their project has; drops those without a project. */
function repairComments(
  comments: readonly Comment[],
  projects: readonly Project[],
): { comments: Comment[]; repaired: boolean } {
  const byId = new Map(projects.map((project) => [project.id, project]));
  let repaired = false;
  const kept = comments.flatMap((comment) => {
    const project = byId.get(comment.projectId);
    if (!project) {
      repaired = true;
      return [];
    }
    const fixed = placeComment(withSafeCrop(comment), project);
    if (fixed !== comment) repaired = true;
    return [fixed];
  });
  return { comments: kept, repaired };
}

/** A folder for projects left without one when there are no folders at all, dated like the oldest. */
function recoveredFolder(projects: readonly Project[]): Folder {
  const createdAt = Math.min(...projects.map((project) => project.createdAt));
  return { id: RECOVERED_FOLDER_ID, name: DEFAULT_FOLDER_NAME, createdAt, parentId: null };
}

/**
 * Repairs instead of failing: folders with an unknown parent move to the top
 * level and folder cycles are broken, projects without a folder move to the
 * first folder (or, when there are no folders, to one made for them), website
 * projects whose address isn't http(s) are dropped (a page project's bad
 * reference link is removed instead), comments and snapshots without a project
 * are dropped, comments are kept on a surface their project has (see
 * `placeComment`), and unreadable crops are removed from their comments.
 */
function repair(data: SquintData): { data: SquintData; repaired: boolean } {
  const tree = repairFolderTree(data.folders);
  let repaired = tree.some((folder, index) => folder !== data.folders[index]);
  const safe = data.projects.flatMap((project) => {
    const source = safeSource(project.source);
    if (!source) {
      repaired = true;
      return [];
    }
    if (source !== project.source) repaired = true;
    return [source === project.source ? project : { ...project, source }];
  });
  const treeIds = new Set(tree.map((folder) => folder.id));
  const orphans = safe.filter((project) => !treeIds.has(project.folderId));
  const folders = tree.length === 0 && orphans.length > 0 ? [recoveredFolder(orphans)] : tree;
  if (folders !== tree) repaired = true;
  const folderIds = new Set(folders.map((folder) => folder.id));
  const fallback = folders[0]?.id;
  const projects = safe.map((project) => {
    if (folderIds.has(project.folderId) || !fallback) return project;
    repaired = true;
    return { ...project, folderId: fallback };
  });
  const placed = repairComments(data.comments, projects);
  if (placed.repaired) repaired = true;
  const projectIds = new Set(projects.map((project) => project.id));
  const snapshots = data.snapshots.filter((snapshot) => projectIds.has(snapshot.projectId));
  if (snapshots.length !== data.snapshots.length) repaired = true;
  return {
    data: { ...data, folders, projects, comments: placed.comments, snapshots },
    repaired,
  };
}

const isKnownVersion = (value: unknown): value is 1 | 2 | 3 =>
  value === 1 || value === 2 || value === 3;

/**
 * Defensive parse of the stored JSON, version 1, 2 or 3. Never throws. Older
 * versions come back upgraded to version 3 (`storedVersion` says which it
 * was); version 1 images come back as `pendingImages`: save them before
 * saving the data.
 */
export function parseData(raw: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "The saved data isn't valid JSON." };
  }
  if (!isRecord(value) || !isKnownVersion(value.version)) {
    return { ok: false, reason: "The saved data is from an unknown version." };
  }
  const storedVersion = value.version;
  const folders = listOf(value.folders, isFolder);
  const stored = listOf(value.projects, isProject);
  const comments = listOf(value.comments, isComment);
  if (!folders || !stored || !comments) {
    return { ok: false, reason: "The saved data is incomplete or damaged." };
  }
  const pendingImages: PendingImage[] = [];
  const projects = stored.map((project) => upgradeProject(project, pendingImages));
  const authorName = isString(value.authorName) ? value.authorName : null;
  const read = readSnapshots(value.snapshots);
  const result = repair({
    version: 3,
    folders: folders.map(upgradeFolder),
    projects,
    comments: storedVersion < 3 ? upgradeComments(comments, projects) : comments,
    snapshots: read.snapshots,
    revocations: readRevocations(value.revocations),
    authorName,
  });
  const kept = new Set(result.data.projects.map((project) => projectImageKey(project.id)));
  return {
    ok: true,
    data: result.data,
    repaired: result.repaired || read.repaired,
    pendingImages: pendingImages.filter((image) => kept.has(image.key)),
    storedVersion,
  };
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
