import type { Comment } from "@/lib/store/types";
import { PersonAvatar, type AvatarSurface } from "../ui/PersonAvatar";
import { useCommentPeople } from "./comment-people";

interface CommentAuthorAvatarProps {
  comment: Comment;
  /** What the comment sits on: a card in the list, the panel in the pin's popover. */
  surface: AvatarSurface;
}

/**
 * Who wrote a comment, between its pin number and their name: a team
 * member's photo (or default mark) with the company badge; a client's
 * initials circle, the same size and without a badge, so names line up in the list.
 */
export function CommentAuthorAvatar({ comment, surface }: CommentAuthorAvatarProps) {
  const { badge, isTeam } = useCommentPeople();
  const team = isTeam(comment);
  return (
    <PersonAvatar
      src={team ? (comment.authorAvatar ?? null) : null}
      size="xs"
      person={team ? "member" : "client"}
      badge={team ? badge : null}
      surface={surface}
      photoTestId="comment-avatar"
      initialsTestId="comment-initials"
    />
  );
}
