import { crossSiteRefusal, isCrossSite } from "@/lib/auth/http";
import { EDIT_KEY_HEADER, failure, json, notFound, readJson } from "@/lib/share/http";
import { asClient } from "@/lib/share/routes";
import { clientEditSchema, itemIdSchema } from "@/lib/share/schemas";
import { editClientComment } from "@/lib/share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string; commentId: string }> };

/**
 * `PATCH { body }` with the comment's edit key in `x-squint-edit-key`: a
 * client changes the words of a comment they posted from this browser (4.12).
 * 200 with the comment; 404 for an unknown comment or a wrong or missing key
 * alike; 409 `locked` once the team has resolved it; 403 `review-closed` once
 * the review window is over; 403 `cross-site` from another site; 429 past the
 * `clientEdit` limit.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { token, commentId } = await params;
  if (isCrossSite(request)) return crossSiteRefusal();
  return asClient(request, token, "clientEdit", async ({ services, share }) => {
    if (!itemIdSchema.safeParse(commentId).success) return notFound();
    const body = await readJson(request, clientEditSchema);
    if (!body.ok) return body.response;
    const key = request.headers.get(EDIT_KEY_HEADER);
    const edited = await editClientComment(
      services,
      share,
      commentId,
      key,
      body.value.body,
      Date.now(),
    );
    return edited.ok ? json(edited.value) : failure(edited);
  });
}
