import { Icon } from "./Icon";

/**
 * Marks a comment the team keeps to itself (057), in the Client chip's shape and inverse ink, so
 * the two read as a pair and never meet: a team-only comment is always the team's own.
 */
export function TeamOnlyChip() {
  return (
    <span
      data-testid="team-only-chip"
      className="inline-flex h-6 shrink-0 items-center gap-1 rounded-pin bg-inv px-3 text-label font-semibold whitespace-nowrap text-on-inv"
    >
      <Icon name="lock" className="size-3.5" />
      Team only
    </span>
  );
}
