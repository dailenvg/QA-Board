import { createContext, use } from "react";
import type { Comment } from "@/lib/store/types";
import type { CompanyBadge } from "@/lib/avatar/company-badge";
import { useCompanyBadge } from "@/lib/workspace-client/use-company-badge";

/** Who wrote the viewer's comments, as their avatars show it (4b.15). */
export interface CommentPeople {
  /** The company badge on the team's avatars; null without a company to show. */
  badge: CompanyBadge | null;
  /**
   * The company, where its badge means something a screen reader needs: on a
   * review link (the team, not another client). Null in the workspace, where
   * the Client chip already tells them apart.
   */
  teamCompany: string | null;
  /** Whether someone on the team wrote it. */
  isTeam: (comment: Comment) => boolean;
}

/** A review link's people (the server marks the team's comments). Null: the workspace's. */
export const CommentPeopleContext = createContext<CommentPeople | null>(null);

/** In the workspace, every comment but a client's is the team's. */
const notFromClient = (comment: Comment) => !comment.fromClient;

/** The review link's people when there's one, else the signed-in workspace's. */
export function useCommentPeople(): CommentPeople {
  const shared = use(CommentPeopleContext);
  const badge = useCompanyBadge();
  return shared ?? { badge, teamCompany: null, isTeam: notFromClient };
}
