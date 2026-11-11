import { projectsInside } from "@/lib/store/folders";
import { summarize } from "@/lib/store/selectors";
import type { Folder, Project, SquintData } from "@/lib/store/types";
import { displayHost } from "@/lib/url";
import {
  isFiltered,
  matchesFilter,
  NO_FILTER,
  type ProjectFilter,
} from "../dashboard/status-filter";
import type { FolderFile } from "./glass-folder/GlassFolder";

/**
 * The projects in a folder and its subfolders that `filter` shows (by default every one that
 * isn't archived), as a folder card counts them.
 */
export function projectsMatching(
  data: SquintData,
  folderId: string,
  filter: ProjectFilter = NO_FILTER,
): Project[] {
  return projectsInside(data, folderId).filter((project) =>
    matchesFilter(project, summarize(data, project).status, filter),
  );
}

/** Of `folders`, those holding a project `filter` shows anywhere inside; all of them unfiltered. */
export function foldersMatching(
  data: SquintData,
  folders: readonly Folder[],
  filter: ProjectFilter,
): Folder[] {
  if (!isFiltered(filter)) return [...folders];
  return folders.filter((folder) => projectsMatching(data, folder.id, filter).length > 0);
}

function toFile(data: SquintData, project: Project): FolderFile {
  const { source } = project;
  const { status, previewKey } = summarize(data, project);
  return {
    id: project.id,
    name: project.name,
    status,
    ...(source.kind === "pages"
      ? {
          ...(previewKey ? { imageKey: previewKey } : {}),
          meta: source.origin === "pdf" ? "PDF" : "Image",
        }
      : { meta: displayHost(source.url) }),
  };
}

/**
 * The projects in a folder and its subfolders that `filter` shows, as glass-folder files,
 * newest first (by creation, so edits don't reshuffle).
 */
export function folderFiles(
  data: SquintData,
  folderId: string,
  filter: ProjectFilter = NO_FILTER,
): FolderFile[] {
  return projectsMatching(data, folderId, filter)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((project) => toFile(data, project));
}

/**
 * "No projects", "1 project", "3 projects". A folder's count includes its
 * subfolders' projects, and says so when it has subfolders: "5 projects in
 * all" (as the sidebar tree reads it). Short, so it fits a folder card.
 */
export function projectCountLabel(count: number, hasSubfolders = false): string {
  if (count === 0) return "No projects";
  const projects = `${count} ${count === 1 ? "project" : "projects"}`;
  return hasSubfolders ? `${projects} in all` : projects;
}
