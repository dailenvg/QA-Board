import { renderBrandIcon } from "@/components/link-preview/render-brand-icon";
import { openPublicWorkspaceIcon } from "@/lib/account/public-icon";
import { notFound, rateLimit } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ key: string }> };

/**
 * At its current version, the URL names one picture for good (a new name,
 * color or logo is a new `?v=`), so inboxes' image proxies and browsers may
 * keep it as long as they like.
 */
const CURRENT_CACHE = "public, max-age=31536000, immutable";

/**
 * At any other version (an email sent before the logo changed), the current
 * icon, refreshed within the hour rather than pinned to an old URL.
 */
const STALE_CACHE = "public, max-age=3600";

/**
 * `GET ?v=<version>`: the company icon of a workspace (its logo, or its
 * monogram), as a square PNG, by the workspace's opaque key: the header of
 * its member invite emails, which load it signed out. It shows the company's
 * name and logo only, as a review link's icon does. 404 alike for an unknown
 * key and a workspace archived, waiting to be deleted, or gone.
 */
export async function GET(request: Request, { params }: Params) {
  const limited = rateLimit(request, "card");
  if (limited) return limited;
  const { key } = await params;
  const icon = await openPublicWorkspaceIcon(key);
  if (!icon) return notFound();
  const current = new URL(request.url).searchParams.get("v") === icon.version;
  const rendered = await renderBrandIcon(icon, {
    cacheControl: current ? CURRENT_CACHE : STALE_CACHE,
  });
  return rendered ?? notFound();
}
