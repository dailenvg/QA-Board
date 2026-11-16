import type { Comment } from "@/lib/store/types";
import { useCommentPeople } from "./comment-people";

/**
 * After a team member's name on a review link, for screen readers: the badge
 * says "the company's person" to everyone else, and is decorative itself.
 */
export function CommentTeamNote({ comment }: { comment: Comment }) {
  const { teamCompany, isTeam } = useCommentPeople();
  if (!teamCompany || !isTeam(comment)) return null;
  return <span className="sr-only">, on the {teamCompany} team</span>;
}
