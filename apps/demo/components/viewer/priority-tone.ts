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

/** A priority's corner dot on its pin and badge (U3), in the chip's color. */
export const PRIORITY_DOT: Record<CommentPriority, string> = {
  must: "bg-danger",
  should: "bg-warning",
  nit: "bg-muted",
};
