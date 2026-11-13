import { renderBrandIcon } from "@/components/link-preview/render-brand-icon";
import { notFound, rateLimit } from "@/lib/share/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/**
 * `GET ?v=<version>`: the icon of the company that shared the link (its logo,
 * or its monogram), as a square PNG for link previews and the invitation
 * email. 404 like an unknown link for an anonymous link, and for an unknown,
 * revoked or expired one. Open on a password-protected link too: the brand
 * is all a locked link shows.
 */
export async function GET(request: Request, { params }: Params) {
  const limited = rateLimit(request, "card");
  if (limited) return limited;
  const { token } = await params;
  return (await renderBrandIcon(token)) ?? notFound();
}
