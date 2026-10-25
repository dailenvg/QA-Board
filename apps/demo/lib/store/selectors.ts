import { pagesOf } from "./pages";
import { previewSnapshot } from "./snapshots";
import { countComments, deriveStatus, type CommentCounts, type ProjectStatus } from "./status";
import type { Comment, Folder, Project, SquintData } from "./types";

export interface ProjectSummary {
  project: Project;
  counts: CommentCounts;
  status: ProjectStatus;
  /**
   * Blob key of the card picture: a page project's first page, or a website's
   * snapshot (see `previewSnapshot`), null until captured.
   */
  previewKey: string | null;
}

export function commentsFor(data: SquintData, projectId: string): Comment[] {
  return data.comments
    .filter((comment) => comment.projectId === projectId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** The blob key of a project's card picture (see `ProjectSummary.previewKey`). */
export function previewKeyOf(data: SquintData, project: Project): string | null {
  if (project.source.kind === "pages") return pagesOf(project)[0]?.blobKey ?? null;
  return previewSnapshot(data, project.id)?.blobKey ?? null;
}

export function summarize(data: SquintData, project: Project): ProjectSummary {
  const counts = countComments(commentsFor(data, project.id));
  return { project, counts, status: deriveStatus(counts), previewKey: previewKeyOf(data, project) };
}

/**
 * Comment counts on each of a project's pages, by page id, every page
 * included. Comments on snapshots (from a project's website days) aren't on a page.
 */
export function pageCounts(data: SquintData, project: Project): Map<string, CommentCounts> {
  const comments = commentsFor(data, project.id);
  return new Map(
    pagesOf(project).map((page) => [
      page.id,
      countComments(comments.filter((comment) => comment.pageId === page.id)),
    ]),
  );
}

/** Projects in a folder, most recently updated first. */
export function folderSummaries(data: SquintData, folderId: string): ProjectSummary[] {
  return data.projects
    .filter((project) => project.folderId === folderId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((project) => summarize(data, project));
}

export function sortedFolders(data: SquintData): Folder[] {
  return [...data.folders].sort((a, b) => a.createdAt - b.createdAt);
}

/** Pin numbers follow creation order across the project, resolved or not. */
export function pinNumbers(comments: readonly Comment[]): Map<string, number> {
  return new Map(comments.map((comment, index) => [comment.id, index + 1]));
}

/** The requested folder, else the first. Stored data always has at least one folder. */
export function pickFolder(folders: readonly Folder[], id: string | null): Folder {
  const folder = folders.find((entry) => entry.id === id) ?? folders[0];
  if (!folder) throw new Error("Squint data has no folders.");
  return folder;
}
