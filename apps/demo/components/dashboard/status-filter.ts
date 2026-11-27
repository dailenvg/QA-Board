import { isArchived } from "@/lib/store/archive";
import { NO_STAGE_LABEL, STAGE_LABEL } from "@/lib/store/stage";
import { STATUS_LABEL, type ProjectStatus } from "@/lib/store/status";
import type { Project, ProjectStage } from "@/lib/store/types";
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

/** Every project, those without a stage (`none`), or those at one stage. */
export type StageFilterValue = "all" | "none" | ProjectStage;

/**
 * What a folder page or Folders shows: a status (or the archive) and, optionally, one label
 * and one stage (or no stage), all at once.
 */
export interface ProjectFilter {
  status: StatusFilterValue;
  /** Only projects with this label; null for any (or none). */
  label: string | null;
  stage: StageFilterValue;
}

export const NO_FILTER: ProjectFilter = { status: "all", label: null, stage: "all" };

/** The stage filter's choice in words: "All stages", "No stage" or the stage's name. */
export function stageFilterLabel(stage: StageFilterValue): string {
  if (stage === "all") return "All stages";
  return stage === "none" ? NO_STAGE_LABEL : STAGE_LABEL[stage];
}

/** Whether `project` is at the stage `filter` asks for. */
function matchesStage(project: Project, stage: StageFilterValue): boolean {
  if (stage === "all") return true;
  return (project.stage ?? "none") === stage;
}

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
  if (!matchesStage(project, filter.stage)) return false;
  if (filter.status === "archived") return isArchived(project);
  if (isArchived(project)) return false;
  return filter.status === "all" || filter.status === status;
}

/** Whether anything narrows the list beyond the default (every project that isn't archived). */
export function isFiltered(filter: ProjectFilter): boolean {
  return filter.status !== "all" || filter.label !== null || filter.stage !== "all";
}

/** Folders' empty state for each reason nothing matched. */
const FOLDERS_KIND = {
  stage: "foldersStage",
  label: "foldersLabel",
  archived: "foldersArchived",
} as const satisfies Record<string, DashboardEmptyKind>;

/**
 * Which empty state says nothing matched `filter`, on a folder page or on Folders: the stage's
 * whenever one is chosen, else the label's, else the archive's or the status's.
 */
export function noMatchKind(
  filter: ProjectFilter,
  scope: "folder" | "folders",
): DashboardEmptyKind {
  const reason =
    filter.stage !== "all"
      ? "stage"
      : filter.label !== null
        ? "label"
        : filter.status === "archived"
          ? "archived"
          : null;
  if (scope === "folder") return reason ?? "filter";
  return reason === null ? "folders" : FOLDERS_KIND[reason];
}
