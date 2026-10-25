import { projectHref } from "@/lib/routes";
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

/** A folder's projects as glass-folder files, newest first (by creation, so edits don't reshuffle). */
export function folderFiles(data: SquintData, folderId: string): FolderFile[] {
  return data.projects
    .filter((project) => project.folderId === folderId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((project) => toFile(data, project));
}

/** "No projects", "1 project", "3 projects". */
export function projectCountLabel(count: number): string {
  if (count === 0) return "No projects";
  return `${count} ${count === 1 ? "project" : "projects"}`;
}
