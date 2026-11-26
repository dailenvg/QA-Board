"use client";

import { COMMENT_PRIORITIES, PRIORITY_LABEL } from "@/lib/store/priority";
import type { CommentPriority } from "@/lib/store/types";
import { Menu, type MenuItem } from "../ui/Menu";

interface CommentMoreMenuProps {
  /** The comment's pin number, for the trigger's name. */
  number: number;
  /** The comment's priority now; null for none. */
  priority: CommentPriority | null;
  /** Sets or clears (null) the comment's priority. */
  onSetPriority: (priority: CommentPriority | null) => void;
  /** Opens "Browser details" for the comment (`GetInfoDialog`). */
  onGetInfo: () => void;
}

/** None, then Must fix, Should fix and Nit: the composer's choices, the current one checked. */
function priorityItems({
  priority,
  onSetPriority,
}: Pick<CommentMoreMenuProps, "priority" | "onSetPriority">): MenuItem[] {
  const choices: Array<CommentPriority | null> = [null, ...COMMENT_PRIORITIES];
  return choices.map((choice) => ({
    id: `priority-${choice ?? "none"}`,
    label: choice ? PRIORITY_LABEL[choice] : "None",
    group: "Priority",
    checked: choice === priority,
    onSelect: () => onSetPriority(choice),
    testId: `comment-priority-${choice ?? "none"}`,
  }));
}

/**
 * The team's own items for a comment, in their menu's order: Priority (any
 * member sets it, D10), then Get info. Copy link joins first (PR 7). Guests
 * never get this menu.
 */
function commentMenuItems(props: Omit<CommentMoreMenuProps, "number">): MenuItem[] {
  return [
    ...priorityItems(props),
    { label: "Get info", icon: "info", onSelect: props.onGetInfo, testId: "comment-get-info" },
  ];
}

/**
 * A comment's "More" button (···) on its card and in its pin's popover, right
 * of Edit. Delete stays its own button.
 */
export function CommentMoreMenu({ number, ...props }: CommentMoreMenuProps) {
  return (
    <Menu
      label={`Actions for comment ${number}`}
      items={commentMenuItems(props)}
      testId="comment-more"
    />
  );
}
