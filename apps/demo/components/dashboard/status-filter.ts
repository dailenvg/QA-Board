import { isArchived } from "@/lib/store/archive";
import { STATUS_LABEL, type ProjectStatus } from "@/lib/store/status";
import type { Project } from "@/lib/store/types";
import type { SegmentOption } from "../ui/SegmentedControl";
import type { DashboardEmptyKind } from "./DashboardEmpty";

/** A status, or "archived": the only choice that shows archived projects (and only them). */
export type StatusFilterValue = "all" | ProjectStatus | "archived";

export const STATUS_FILTER_OPTIONS: ReadonlyArray<SegmentOption<StatusFilterValue>> = [
  { value: "all", label: "All" },
  { value: "ready", label: STATUS_LABEL.ready },
  { value: "comments", label: STATUS_LABEL.comments },
  { value: "resolved", label: STATUS_LABEL.resolved },
  { value: "archived", label: "Archived", icon: "archive" },
];

/** What a folder page or Folders shows: a status (or the archive) and, optionally, one label. */
export interface ProjectFilter {
  status: StatusFilterValue;
  /** Only projects with this label; null for any (or none). */
  label: string | null;
}

export const NO_FILTER: ProjectFilter = { status: "all", label: null };

/**
 * Whether `project`, whose comments give it `status`, shows under `filter`.
 * Archived projects show under Archived only; every other choice leaves them out.
 */
export function matchesFilter(
  project: Project,
  status: ProjectStatus,
  filter: ProjectFilter,
): boolean {
  if (filter.label !== null && project.label !== filter.label) return false;
  if (filter.status === "archived") return isArchived(project);
  if (isArchived(project)) return false;
  return filter.status === "all" || filter.status === status;
}

/** Whether anything narrows the list beyond the default (every project that isn't archived). */
export function isFiltered(filter: ProjectFilter): boolean {
  return filter.status !== "all" || filter.label !== null;
}

/** Which empty state says nothing matched `filter`: on a folder page, or on Folders. */
export function noMatchKind(
  filter: ProjectFilter,
  scope: "folder" | "folders",
): DashboardEmptyKind {
  const reason = filter.label !== null ? "label" : filter.status === "archived" ? "archived" : null;
  if (scope === "folder") return reason ?? "filter";
  return reason === "label"
    ? "foldersLabel"
    : reason === "archived"
      ? "foldersArchived"
      : "folders";
}
