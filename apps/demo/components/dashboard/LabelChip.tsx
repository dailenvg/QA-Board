import { Icon } from "../ui/Icon";

/**
 * A project's label, as a small neutral pill with a tag icon, cut short with an ellipsis when
 * it doesn't fit (the full label is its tooltip).
 */
export function LabelChip({ label }: { label: string }) {
  return (
    <span
      data-testid="label-chip"
      title={label}
      className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-pill bg-card px-3 py-1 text-label font-medium text-ink-2"
    >
      <Icon name="tag" className="size-3.5 shrink-0" />
      <span className="sr-only">Label: </span>
      <span className="truncate">{label}</span>
    </span>
  );
}
