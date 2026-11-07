import type { Action } from "../store/reducer";
import { sortedFolders } from "../store/selectors";
import type { Folder, Project, SquintData } from "../store/types";
import type { ShareLink, WorkspaceData, WorkspaceProject } from "../workspace/types";

/** Where a project without a folder goes when the workspace has no folder at all. */
export const RESTORED_FOLDER_NAME = "Restored projects";

/**
 * Stands in for a null `folderId` (a trashed project restored after its
 * folder was deleted) until `fileOrphans` moves it into a real folder.
 */
const NO_FOLDER = "";

function toProject(project: WorkspaceProject, links: ReadonlyMap<string, ShareLink>): Project {
  const { id, folderId, name, source, createdAt, updatedAt, share } = project;
  const link = share ? links.get(share.id) : undefined;
  return {
    id,
    folderId: folderId ?? NO_FOLDER,
    name,
    source,
    createdAt,
    updatedAt,
    ...(share && link
      ? {
          share: {
            id: share.id,
            token: link.token,
            ownerKey: link.ownerKey,
            createdAt: share.createdAt,
            cursor: share.cursor,
            ...(share.lastSyncedAt === undefined ? {} : { lastSyncedAt: share.lastSyncedAt }),
          },
        }
      : {}),
  };
}

/**
 * The workspace as the browser store holds it. A review link shows only
 * once its secrets are in `links` (by share id). Pending revocations are a
 * browser-only idea: the server revokes a trashed project's link itself.
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
    revocations: [],
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
 * has a folder.
 */
export function fileOrphans(data: SquintData, now: number, newId: () => string): Action[] {
  const folderIds = new Set(data.folders.map((folder) => folder.id));
  const orphans = data.projects.filter((project) => !folderIds.has(project.folderId));
  if (orphans.length === 0) return [];
  const existing = sortedFolders(data)[0];
  const home: Folder = existing ?? {
    id: newId(),
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
