import { relativeTime } from "@/lib/relative-time";
import { Icon, type IconName } from "../ui/Icon";
import type { Placement } from "./surface";

function copyFor(
  placement: Placement,
  now: number,
): { icon: IconName; label: string; hint: string } {
  switch (placement.kind) {
    case "live":
      return {
        icon: "globe",
        label: "Live page",
        hint: "Placed on the live site before snapshots. Its pin sits on the visible frame in Browse mode, so it may not line up after scrolling.",
      };
    case "earlier":
      return {
        icon: "history",
        label: `Earlier snapshot · ${relativeTime(placement.at, now)}`,
        hint: "Placed on an earlier snapshot. Select the comment to see it there.",
      };
    case "missing":
      return {
        icon: "alert",
        label: "Snapshot unavailable",
        hint: "The snapshot this pin was placed on is no longer saved.",
      };
  }
}

/** Says where a comment's pin lives when it isn't on the current snapshot. */
export function PlacementChip({
  id,
  placement,
  now,
}: {
  id: string;
  placement: Placement;
  now: number;
}) {
  const copy = copyFor(placement, now);
  return (
    <span
      id={id}
      title={copy.hint}
      data-testid="placement-chip"
      data-placement={placement.kind}
      className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-pill bg-seg px-2.5 py-1 text-label font-semibold text-ink-2"
    >
      <Icon name={copy.icon} className="size-3.5 shrink-0" />
      <span className="truncate">{copy.label}</span>
      <span className="sr-only">. {copy.hint}</span>
    </span>
  );
}
