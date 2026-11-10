import { projectsInside } from "@/lib/store/folders";
import { summarize } from "@/lib/store/selectors";
import type { Folder, Project, SquintData } from "@/lib/store/types";
import { displayHost } from "@/lib/url";
import type { StatusFilterValue } from "../dashboard/status-filter";
import type { FolderFile } from "./glass-folder/GlassFolder";

/**
 * The projects in a folder and its subfolders with `status` ("all": every one), as a folder
 * card counts them.
 */
export function projectsWithStatus(
  data: SquintData,
  folderId: string,
  status: StatusFilterValue = "all",
): Project[] {
  const inside = projectsInside(data, folderId);
  if (status === "all") return inside;
  return inside.filter((project) => summarize(data, project).status === status);
}

/** Of `folders`, those holding a project with `status` anywhere inside; all of them for "all". */
export function foldersWithStatus(
  data: SquintData,
  folders: readonly Folder[],
  status: StatusFilterValue,
): Folder[] {
  if (status === "all") return [...folders];
  return folders.filter((folder) => projectsWithStatus(data, folder.id, status).length > 0);
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
 * The projects in a folder and its subfolders (with `status`, when filtered) as glass-folder
 * files, newest first (by creation, so edits don't reshuffle).
 */
export function folderFiles(
  data: SquintData,
  folderId: string,
  status: StatusFilterValue = "all",
): FolderFile[] {
  return projectsWithStatus(data, folderId, status)
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
