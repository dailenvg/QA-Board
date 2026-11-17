import { Icon } from "../ui/Icon";
import { BADGE_SHELL, NEUTRAL_BADGE } from "../ui/StatusChip";

/** In place of the status on an archived project's card: it's out of the way, not in review. */
export function ArchivedChip() {
  return (
    <span
      data-testid="archived-chip"
      className={`${BADGE_SHELL} shrink-0 font-semibold ${NEUTRAL_BADGE}`}
    >
      <Icon name="archive" className="size-4 shrink-0" />
      Archived
    </span>
  );
}
