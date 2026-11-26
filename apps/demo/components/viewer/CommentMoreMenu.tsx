"use client";

import { COMMENT_PRIORITIES, PRIORITY_LABEL } from "@/lib/store/priority";
import type { CommentPriority } from "@/lib/store/types";
import { Menu, type MenuItem } from "../ui/Menu";

interface CommentMoreMenuProps {
  /** The comment's pin number, for the trigger's name. */
  number: number;
  /** Copies the comment's link: the project's for the team (D14), the review link's for a guest. */
  onCopyLink: () => void;
  /** The comment's priority now; null for none. The team's, with `onSetPriority`. */
  priority?: CommentPriority | null;
  /** Sets or clears (null) the comment's priority (any member, D10); guests get none. */
  onSetPriority?: (priority: CommentPriority | null) => void;
  /** Opens "Browser details" for the comment (`GetInfoDialog`); the team's only. */
  onGetInfo?: () => void;
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

/**
 * The items in their menu's order (U6): Copy link, then the team's Priority
 * and Get info. A guest's menu has Copy link only.
 */
function commentMenuItems({
  onCopyLink,
  priority = null,
  onSetPriority,
  onGetInfo,
}: Omit<CommentMoreMenuProps, "number">): MenuItem[] {
  const items: MenuItem[] = [
    { label: "Copy link", icon: "link", onSelect: onCopyLink, testId: "comment-copy-link" },
  ];
  if (onSetPriority) items.push(...priorityItems(priority, onSetPriority));
  if (onGetInfo) {
    items.push({
      label: "Get info",
      icon: "info",
      onSelect: onGetInfo,
      testId: "comment-get-info",
    });
  }
  return items;
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
