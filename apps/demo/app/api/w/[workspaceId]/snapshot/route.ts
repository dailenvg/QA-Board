import { json } from "@/lib/share/http";
import { loadWorkspace } from "@/lib/workspace/load-workspace";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string };

/** `GET`: everything the workspace shows, in one read (`WorkspaceData`). */
export const GET = withMember<Params>(async (_request, { db, membership, user }) =>
  json(await loadWorkspace(db, membership, user.id)),
);
