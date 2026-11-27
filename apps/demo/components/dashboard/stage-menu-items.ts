import { NO_STAGE_LABEL, PROJECT_STAGES, STAGE_LABEL } from "@/lib/store/stage";
import type { ProjectStage } from "@/lib/store/types";
import type { MenuItem } from "../ui/menu-item";

/**
 * The "Stage" radio group (U3): the four stages, then No stage, the current one checked. The
 * card's Actions menu and the viewer's stage menu list the same items.
 */
export function stageMenuItems(
  stage: ProjectStage | null,
  onChange: (stage: ProjectStage | null) => void,
): MenuItem[] {
  const choices: Array<ProjectStage | null> = [...PROJECT_STAGES, null];
  return choices.map((choice) => ({
    id: `stage-${choice ?? "none"}`,
    label: choice ? STAGE_LABEL[choice] : NO_STAGE_LABEL,
    group: "Stage",
    checked: choice === stage,
    onSelect: () => onChange(choice),
    testId: `stage-${choice ?? "none"}`,
  }));
}
