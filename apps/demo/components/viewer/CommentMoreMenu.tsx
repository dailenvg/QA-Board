"use client";

import { Menu, type MenuItem } from "../ui/Menu";

interface CommentMoreMenuProps {
  /** The comment's pin number, for the trigger's name. */
  number: number;
  /** Opens "Browser details" for the comment (`GetInfoDialog`). */
  onGetInfo: () => void;
}

/**
 * The team's own items for a comment, in their menu's order (Copy link and
 * Priority join before Get info). Guests never get this menu.
 */
function commentMenuItems({ onGetInfo }: Pick<CommentMoreMenuProps, "onGetInfo">): MenuItem[] {
  return [{ label: "Get info", icon: "info", onSelect: onGetInfo, testId: "comment-get-info" }];
}

/**
 * A comment's "More" button (···) on its card and in its pin's popover, right
 * of Edit. Delete stays its own button.
 */
export function CommentMoreMenu({ number, onGetInfo }: CommentMoreMenuProps) {
  return (
    <Menu
      label={`More actions for comment ${number}`}
      items={commentMenuItems({ onGetInfo })}
      testId="comment-more"
    />
  );
}
