import { Icon } from "../ui/Icon";

/** In place of the status on an archived project's card: it's out of the way, not in review. */
export function ArchivedChip() {
  return (
    <span
      data-testid="archived-chip"
      className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-card px-3 py-1 text-label font-semibold whitespace-nowrap text-ink-2"
    >
      <Icon name="archive" className="size-3.5 shrink-0" />
      Archived
    </span>
  );
}
