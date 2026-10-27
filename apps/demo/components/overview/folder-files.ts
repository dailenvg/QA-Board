import { projectsInside } from "@/lib/store/folders";
import { summarize } from "@/lib/store/selectors";
import type { Project, SquintData } from "@/lib/store/types";
import { displayHost } from "@/lib/url";
import type { FolderFile } from "./glass-folder/GlassFolder";

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
 * The projects in a folder and its subfolders as glass-folder files, newest first (by
 * creation, so edits don't reshuffle).
 */
export function folderFiles(data: SquintData, folderId: string): FolderFile[] {
  return projectsInside(data, folderId)
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
