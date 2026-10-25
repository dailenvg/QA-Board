import type { Folder, SquintData } from "./types";

const byAge = (a: Folder, b: Folder) => a.createdAt - b.createdAt;

/** A folder's direct subfolders (top-level folders for `null`), oldest first. */
export function childFolders(folders: readonly Folder[], parentId: string | null): Folder[] {
  return folders.filter((folder) => folder.parentId === parentId).sort(byAge);
}

/** One row of the folder tree, in display order. */
export interface FolderNode {
  folder: Folder;
  /** 0 at the top level. */
  depth: number;
  hasChildren: boolean;
}

/**
 * The folder tree, depth first (each folder followed by its subfolders, siblings
 * oldest first), skipping the subfolders of folders `isOpen` says are closed.
 */
export function flattenFolderTree(
  folders: readonly Folder[],
  isOpen: (folderId: string) => boolean = () => true,
): FolderNode[] {
  const rows: FolderNode[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const folder of childFolders(folders, parentId)) {
      const hasChildren = folders.some((entry) => entry.parentId === folder.id);
      rows.push({ folder, depth, hasChildren });
      if (hasChildren && isOpen(folder.id)) visit(folder.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

/** The folders above `folderId`, from the top level down (empty for a top-level folder). */
export function ancestorsOf(folders: readonly Folder[], folderId: string): Folder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const chain: Folder[] = [];
  let parentId = byId.get(folderId)?.parentId ?? null;
  // Load repair guarantees there are no cycles; the bound is a guard all the same.
  while (parentId !== null && chain.length < folders.length) {
    const parent = byId.get(parentId);
    if (!parent) break;
    chain.unshift(parent);
    parentId = parent.parentId;
  }
  return chain;
}

/** `folderId` and every folder inside it, at any depth. */
export function subtreeIds(folders: readonly Folder[], folderId: string): Set<string> {
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId !== null && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Why `folderId` can't move into `parentId` (null: the top level), or null when it can. */
export function folderMoveProblem(
  folders: readonly Folder[],
  folderId: string,
  parentId: string | null,
): string | null {
  const folder = folders.find((entry) => entry.id === folderId);
  if (!folder) return "That folder no longer exists.";
  if (parentId === folder.parentId) return "It's already here.";
  if (parentId === null) return null;
  if (parentId === folderId) return "A folder can't go inside itself.";
  if (!folders.some((entry) => entry.id === parentId)) return "That folder no longer exists.";
  if (subtreeIds(folders, folderId).has(parentId)) {
    return "A folder can't go inside one of its own subfolders.";
  }
  return null;
}

/** What deleting a folder takes with it. */
export interface FolderContents {
  /** Folders inside it, at any depth. */
  subfolders: number;
  projects: number;
  comments: number;
  /** Projects inside with a working share link. */
  shared: number;
}

export function folderContents(data: SquintData, folderId: string): FolderContents {
  const ids = subtreeIds(data.folders, folderId);
  const projects = data.projects.filter((project) => ids.has(project.folderId));
  const projectIds = new Set(projects.map((project) => project.id));
  return {
    subfolders: ids.size - 1,
    projects: projects.length,
    comments: data.comments.filter((comment) => projectIds.has(comment.projectId)).length,
    shared: projects.filter((project) => project.share).length,
  };
}

/** Projects in `folderId` and every folder inside it. */
export function projectsInside(data: SquintData, folderId: string) {
  const ids = subtreeIds(data.folders, folderId);
  return data.projects.filter((project) => ids.has(project.folderId));
}

/** Whether deleting the folder (and its subfolders) still leaves at least one folder. */
export function canDeleteFolder(folders: readonly Folder[], folderId: string): boolean {
  return subtreeIds(folders, folderId).size < folders.length;
}
