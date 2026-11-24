import { ClientChip } from "../ui/ClientChip";
import type { Authored } from "./comment-people";

interface ClientMarkProps {
  /** A comment, or a reply in its thread. */
  comment: Authored;
  /** The workspace's viewer. A guest on a review link never sees the mark. */
  owner: boolean;
}

/** The Client chip after a commenter's name, on comments and replies a client left on the review link. */
export function ClientMark({ comment, owner }: ClientMarkProps) {
  if (!owner || !comment.fromClient) return null;
  return (
    <>
      <span className="sr-only">, </span>
      <ClientChip />
    </>
  );
}
