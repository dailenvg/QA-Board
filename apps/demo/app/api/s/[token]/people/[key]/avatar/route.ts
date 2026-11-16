import { brandLogoResponse, readTeamAvatar } from "@/lib/share/brand-logo";
import { notFound } from "@/lib/share/http";
import { asClient } from "@/lib/share/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string; key: string }> };

/**
 * `GET ?v=<version>`: a team member's avatar on a review link, by their key
 * on this link (from the review's comments, 4.11). Behind the link's password
 * like the review itself. Kept a few minutes at its version on this link;
 * at any other (a review open since the photo changed), their current photo,
 * never cached, as the app's own avatar route does. 404 like an unknown link
 * for a key no active member of the link's workspace has (another link's, a
 * removed or deleted member's), and without a photo.
 */
export async function GET(request: Request, { params }: Params) {
  const { token, key } = await params;
  return asClient(request, token, "clientRead", async ({ services, share }) => {
    const avatar = await readTeamAvatar(services.store, share.id, key);
    if (!avatar) return notFound();
    return brandLogoResponse(avatar, new URL(request.url).searchParams.get("v"));
  });
}
