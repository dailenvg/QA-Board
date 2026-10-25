import { previewSnapshot } from "./snapshots";
import { countComments, deriveStatus, type CommentCounts, type ProjectStatus } from "./status";
import type { Comment, Folder, Project, SquintData } from "./types";

export interface ProjectSummary {
  project: Project;
  counts: CommentCounts;
  status: ProjectStatus;
  /** Blob key of a website project's card picture (see `previewSnapshot`); null until captured. */
  previewKey: string | null;
}

export function commentsFor(data: SquintData, projectId: string): Comment[] {
  return data.comments
    .filter((comment) => comment.projectId === projectId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function summarize(data: SquintData, project: Project): ProjectSummary {
  const counts = countComments(commentsFor(data, project.id));
  const preview = project.source.kind === "url" ? previewSnapshot(data, project.id) : null;
  return { project, counts, status: deriveStatus(counts), previewKey: preview?.blobKey ?? null };
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

export function projectCount(data: SquintData, folderId: string): number {
  return data.projects.filter((project) => project.folderId === folderId).length;
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
