import { brandLogoResponse } from "@/lib/share/brand-logo";
import { notFound } from "@/lib/share/http";
import { readPersonAvatar } from "@/lib/workspace/members/person-key";
import { withMember } from "@/lib/workspace/with-member";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { workspaceId: string; personKey: string };

/**
 * `GET ?v=<version>`: the avatar of the workspace's member whose person key
 * this is, for anyone in the same workspace. 404 for a key no active member
 * of it has (another workspace's, a removed member's), and without an avatar.
 */
export const GET = withMember<Params>(async (request, { db, workspaceId }, params) => {
  const avatar = await readPersonAvatar(db, workspaceId, params.personKey);
  if (!avatar) return notFound();
  return brandLogoResponse(avatar, new URL(request.url).searchParams.get("v"));
});
