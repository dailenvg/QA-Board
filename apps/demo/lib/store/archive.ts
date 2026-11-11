import { ARCHIVE_GRACE_MS, WORKSPACE_LIMITS } from "../workspace/limits";
import type { Project, SquintData } from "./types";

/** Archiving and labels, as the browser store sees them. */

export function isArchived(project: Project): boolean {
  return project.archivedAt !== undefined;
}

/** `project` archived at `at` (an archived one keeps its dates), or unarchived. */
export function withArchived(project: Project, archived: boolean, at: number): Project {
  const { archivedAt: _archivedAt, deleteAfter: _deleteAfter, ...rest } = project;
  if (!archived) return rest;
  const archivedAt = project.archivedAt ?? at;
  return { ...rest, archivedAt, deleteAfter: project.deleteAfter ?? archivedAt + ARCHIVE_GRACE_MS };
}

/** `project` with `label`, or without one for null. */
export function withLabel(project: Project, label: string | null): Project {
  const { label: _label, ...rest } = project;
  return label === null ? rest : { ...rest, label };
}

/**
 * The workspace without its archived projects (and their comments and
 * snapshots): what the folder grids, counts, search and the Overview show.
 * The same object when nothing is archived.
 */
export function activeData(data: SquintData): SquintData {
  if (!data.projects.some(isArchived)) return data;
  const archived = new Set(data.projects.filter(isArchived).map((project) => project.id));
  return {
    ...data,
    projects: data.projects.filter((project) => !archived.has(project.id)),
    comments: data.comments.filter((comment) => !archived.has(comment.projectId)),
    snapshots: data.snapshots.filter((snapshot) => !archived.has(snapshot.projectId)),
  };
}

/** Trims, collapses spaces and caps a label someone typed. */
export function cleanLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").slice(0, WORKSPACE_LIMITS.label);
}

/** The labels `projects` have, A to Z, each once. */
export function labelsOf(projects: readonly Project[]): string[] {
  const labels = new Set<string>();
  for (const project of projects) if (project.label) labels.add(project.label);
  return [...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Every label used in the workspace, archived projects' included, A to Z. */
export function workspaceLabels(data: SquintData): string[] {
  return labelsOf(data.projects);
}
