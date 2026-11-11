import { brandLogoResponse, readBrandLogo } from "@/lib/share/brand-logo";
import { notFound } from "@/lib/share/http";
import { asClient } from "@/lib/share/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/**
 * `GET ?v=<logoVersion>`: the logo of the company that shared the link,
 * through the token. 404 like an unknown link when there's no logo, and for
 * an unknown, revoked or expired link, or one whose project is in the trash or
 * whose workspace is archived or waiting to be deleted.
 */
export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  return asClient(request, token, "clientRead", async ({ services, share }) => {
    const logo = await readBrandLogo(services.store, share.id);
    if (!logo) return notFound();
    return brandLogoResponse(logo, new URL(request.url).searchParams.get("v"));
  });
}
