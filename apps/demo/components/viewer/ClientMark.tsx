import type { Comment } from "@/lib/store/types";
import { ClientChip } from "../ui/ClientChip";

interface ClientMarkProps {
  comment: Comment;
  /** The workspace's viewer. A guest on a review link never sees the mark. */
  owner: boolean;
}

/** The Client chip after a commenter's name, on comments a client left on the review link. */
export function ClientMark({ comment, owner }: ClientMarkProps) {
  if (!owner || !comment.fromClient) return null;
  return (
    <>
      <span className="sr-only">, </span>
      <ClientChip />
    </>
  );
}
