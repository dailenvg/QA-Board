import { projectHref } from "@/lib/routes";
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
    href: projectHref(project.id),
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
 * subfolders' projects; with `folders` (the folder and its subfolders) above
 * one, it says so: "5 projects in 3 folders".
 */
export function projectCountLabel(count: number, folders = 1): string {
  if (count === 0) return "No projects";
  const projects = `${count} ${count === 1 ? "project" : "projects"}`;
  return folders > 1 ? `${projects} in ${folders} folders` : projects;
}
