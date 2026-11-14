import { renderBrandIcon } from "@/components/link-preview/render-brand-icon";
import { notFound, rateLimit } from "@/lib/share/http";
import { projectCard } from "@/lib/workspace/project-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * `GET ?v=<version>`: the icon of the company whose project this is (its
 * logo, or its monogram), as a square PNG for a project link's preview and
 * its sign-in screen. Open signed out: the company is all the link shows.
 * 404 alike for an unknown id and for a project in the trash or archived,
 * or whose workspace is archived or waiting to be deleted.
 */
export async function GET(request: Request, { params }: Params) {
  const limited = rateLimit(request, "card");
  if (limited) return limited;
  const { id } = await params;
  return (await renderBrandIcon(await projectCard(id))) ?? notFound();
}
