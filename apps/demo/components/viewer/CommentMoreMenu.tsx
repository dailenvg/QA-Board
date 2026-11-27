"use client";

import { COMMENT_PRIORITIES, PRIORITY_LABEL } from "@/lib/store/priority";
import type { CommentPriority } from "@/lib/store/types";
import { Menu, type MenuItem } from "../ui/Menu";

interface CommentMoreMenuProps {
  /** The comment's pin number as shown ("4", "T1"), for the trigger's name. */
  number: string;
  /**
   * Copies the comment's project link (D14): first on the card's menu (U6). The pin popover
   * has its own button for it, so its menu leaves it out.
   */
  onCopyLink?: () => void;
  /** The comment's priority now; null for none. */
  priority: CommentPriority | null;
  /** Sets or clears (null) the comment's priority (any member, D10). */
  onSetPriority: (priority: CommentPriority | null) => void;
  /** Opens "Browser details" for the comment (`GetInfoDialog`). */
  onGetInfo: () => void;
}

/** None, then Must fix, Should fix and Nit: the composer's choices, the current one checked. */
function priorityItems(
  priority: CommentPriority | null,
  onSetPriority: (priority: CommentPriority | null) => void,
): MenuItem[] {
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

/** The items in their menu's order (U6): Copy link (the card's), Priority, then Get info. */
function commentMenuItems({
  onCopyLink,
  priority,
  onSetPriority,
  onGetInfo,
}: Omit<CommentMoreMenuProps, "number">): MenuItem[] {
  const copy: MenuItem[] = onCopyLink
    ? [{ label: "Copy link", icon: "link", onSelect: onCopyLink, testId: "comment-copy-link" }]
    : [];
  return [
    ...copy,
    ...priorityItems(priority, onSetPriority),
    { label: "Get info", icon: "info", onSelect: onGetInfo, testId: "comment-get-info" },
  ];
}

/**
 * The team's "More" button (···) for a comment, on its card and in its pin's
 * popover, right of Edit. Delete stays its own button; guests get none (a
 * guest's card has a Copy link button instead).
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
