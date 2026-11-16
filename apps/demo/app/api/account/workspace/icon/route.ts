import { renderBrandIcon } from "@/components/link-preview/render-brand-icon";
import { withOwnWorkspace } from "@/lib/account/with-account";
import { readWorkspaceIcon } from "@/lib/account/workspace-logo";
import { versionedCacheControl } from "@/lib/share/brand-logo";
import { notFound } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET ?v=<version>`: the company icon of the signed-in user's workspace (its
 * logo, or its monogram), as a square PNG, for any member: the badge on the
 * team's avatars in the app, the twin of a review link's `brand/icon` (4.11).
 * Kept a few minutes at its current version, never at another.
 */
export const GET = withOwnWorkspace(async (request, { db, membership }) => {
  const icon = await readWorkspaceIcon(db, membership.workspaceId);
  if (!icon) return notFound();
  const current = new URL(request.url).searchParams.get("v") === icon.version;
  const rendered = await renderBrandIcon(icon, { cacheControl: versionedCacheControl(current) });
  return rendered ?? notFound();
});
