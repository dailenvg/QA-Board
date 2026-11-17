import { Icon } from "../ui/Icon";
import { BADGE_SHELL, NEUTRAL_BADGE } from "../ui/StatusChip";

/**
 * A project's label, as a small neutral pin with a tag icon, cut short with an ellipsis when
 * it doesn't fit (the full label is its tooltip).
 */
export function LabelChip({ label }: { label: string }) {
  return (
    <span
      data-testid="label-chip"
      title={label}
      className={`${BADGE_SHELL} max-w-full min-w-0 font-medium ${NEUTRAL_BADGE}`}
    >
      <Icon name="tag" className="size-4 shrink-0" />
      <span className="sr-only">Label: </span>
      <span className="truncate">{label}</span>
    </span>
  );
}
