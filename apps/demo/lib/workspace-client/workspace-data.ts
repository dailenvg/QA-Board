import type { Action } from "../store/reducer";
import { sortedFolders } from "../store/selectors";
import type { Folder, Project, SquintData } from "../store/types";
import { ARCHIVE_GRACE_MS } from "../workspace/limits";
import type { ShareLink, WorkspaceData, WorkspaceProject } from "../workspace/types";

/** Where a project without a folder goes when the workspace has no folder at all. */
export const RESTORED_FOLDER_NAME = "Restored projects";
/**
 * That folder's id, the same in every tab, so tabs filing the same projects
 * at once make one folder: the second create finds it there (409, done).
 */
export const RESTORED_FOLDER_ID = "restored-projects";

/**
 * Stands in for a null `folderId` (a trashed project restored after its
 * folder was deleted) until `fileOrphans` moves it into a real folder.
 */
const NO_FOLDER = "";

function toProject(project: WorkspaceProject, links: ReadonlyMap<string, ShareLink>): Project {
  const { id, folderId, name, source, createdAt, updatedAt, share } = project;
  const { label, archivedAt, deleteAfter } = project;
  const link = share ? links.get(share.id) : undefined;
  return {
    id,
    folderId: folderId ?? NO_FOLDER,
    name,
    source,
    createdAt,
    updatedAt,
    ...(label ? { label } : {}),
    // Archiving sets both dates (032 gave older archives theirs); the fallback is archiving's own.
    ...(archivedAt === null
      ? {}
      : { archivedAt, deleteAfter: deleteAfter ?? archivedAt + ARCHIVE_GRACE_MS }),
    ...(share && link
      ? {
          share: {
            id: share.id,
            token: link.token,
            ownerKey: link.ownerKey,
            createdAt: share.createdAt,
            cursor: share.cursor,
            ...(share.lastSyncedAt === undefined ? {} : { lastSyncedAt: share.lastSyncedAt }),
            reviewWindowHours: share.reviewWindowHours,
            reviewEndsAt: share.reviewEndsAt,
            ...(share.passwordSetAt === null ? {} : { passwordSetAt: share.passwordSetAt }),
          },
        }
      : {}),
  };
}

/**
 * The workspace as the browser store holds it. A review link shows only
 * once its secrets are in `links` (by share id).
 */
export function toSquintData(
  workspace: WorkspaceData,
  links: ReadonlyMap<string, ShareLink>,
): SquintData {
  return {
    version: 3,
    folders: workspace.folders,
    projects: workspace.projects.map((project) => toProject(project, links)),
    comments: workspace.comments,
    snapshots: workspace.snapshots,
    authorName: workspace.authorName,
  };
}

/** Review links the browser has no secrets for yet: their projects' ids. */
export function projectsMissingLinks(
  workspace: WorkspaceData,
  links: ReadonlyMap<string, ShareLink>,
): string[] {
  return workspace.projects
    .filter((project) => project.share && !links.has(project.share.id))
    .map((project) => project.id);
}

/**
 * Files projects that sit in no folder: into the oldest folder, or into a new
 * "Restored projects" folder when there is none. Empty when every project
 * has a folder. Idempotent across tabs: the same data files the same way, and
 * moving a project where it already is changes nothing.
 */
export function fileOrphans(data: SquintData, now: number): Action[] {
  const folderIds = new Set(data.folders.map((folder) => folder.id));
  const orphans = data.projects.filter((project) => !folderIds.has(project.folderId));
  if (orphans.length === 0) return [];
  const existing = sortedFolders(data)[0];
  const home: Folder = existing ?? {
    id: RESTORED_FOLDER_ID,
    name: RESTORED_FOLDER_NAME,
    createdAt: now,
    parentId: null,
  };
  return [
    ...(existing ? [] : [{ type: "folder/create", folder: home } as const]),
    ...orphans.map(
      (project) => ({ type: "project/move", id: project.id, folderId: home.id, at: now }) as const,
    ),
  ];
}
