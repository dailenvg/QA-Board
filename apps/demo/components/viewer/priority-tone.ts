import type { CommentPriority } from "@/lib/store/types";

/**
 * A priority's chip (12px semibold, so 4.5:1 or more in both themes): Must fix
 * in the danger tokens, Should fix in the warning ones, Nit muted.
 */
export const PRIORITY_CHIP: Record<CommentPriority, string> = {
  must: "bg-danger-soft text-danger",
  should: "bg-warning-soft text-warning-text",
  nit: "bg-seg text-muted",
};

/**
 * A priority's corner dot (U3), in the chip's color. On a pin it sits on the white pin halo in
 * both themes, so it keeps light mode's fills there (`--pin-must` and the rest, 3:1 or more on
 * white); on a badge it sits on the card, in the themed ones.
 */
export const PRIORITY_DOT: Record<"pin" | "badge", Record<CommentPriority, string>> = {
  pin: { must: "bg-pin-must", should: "bg-pin-should", nit: "bg-pin-nit" },
  badge: { must: "bg-danger", should: "bg-warning", nit: "bg-muted" },
};
