import type { Project, ProjectStage } from "./types";

/**
 * Every stage, in the order the menus list them. A project without one has none (null), where
 * every project starts (056). Set by hand, never derived: the status (`status.ts`) is.
 */
export const PROJECT_STAGES = [
  "open-for-review",
  "editing",
  "on-hold",
  "approved",
] as const satisfies readonly ProjectStage[];

/** What each stage is called wherever it shows (W1); the code values stay as stored. */
export const STAGE_LABEL: Record<ProjectStage, string> = {
  "open-for-review": "With client",
  editing: "Editing",
  "on-hold": "On hold",
  approved: "Approved",
};

/** What "no stage" is called in menus and the filter. */
export const NO_STAGE_LABEL = "No stage";

/** `project` at `stage` from `at`, or without a stage for null. */
export function withStage(project: Project, stage: ProjectStage | null, at: number): Project {
  const { stage: _stage, stageChangedAt: _stageChangedAt, ...rest } = project;
  return stage === null ? rest : { ...rest, stage, stageChangedAt: at };
}
