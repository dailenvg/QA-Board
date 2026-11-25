import { crossSiteRefusal, isCrossSite } from "@/lib/auth/http";
import { userAgentOf } from "@/lib/client-info/schema";
import { failure, json, notFound, readJson } from "@/lib/share/http";
import { asClient } from "@/lib/share/routes";
import { clientReplySchema, itemIdSchema } from "@/lib/share/schemas";
import { addClientReply } from "@/lib/share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string; commentId: string }> };

/**
 * `POST { id, body, author, clientInfo? }`: a client replies to a comment of
 * the link (4.2). 201 with the reply, timestamped by the server; its browser
 * details (`clientInfo`) are kept with the request's user agent, for the
 * team. 404 for an unknown comment or one still being posted; 409 `locked`
 * once the team has resolved it; 409 `exists` for an id already taken (an
 * earlier try got through); 413 `share-full` past 5000 replies on the link
 * or 200 under the comment; 403 `review-closed` once the review window is
 * over; 403 `cross-site` from another site; 429 past the `clientReply` limit.
 */
export async function POST(request: Request, { params }: Params) {
  const { token, commentId } = await params;
  if (isCrossSite(request)) return crossSiteRefusal();
  return asClient(request, token, "clientReply", async ({ services, share }) => {
    if (!itemIdSchema.safeParse(commentId).success) return notFound();
    const input = await readJson(request, clientReplySchema);
    if (!input.ok) return input.response;
    const { clientInfo, ...reply } = input.value;
    const recorded = clientInfo && { ...clientInfo, userAgent: userAgentOf(request) };
    const sent = { ...reply, commentId, ...(recorded ? { clientInfo: recorded } : {}) };
    const added = await addClientReply(services, share, sent, Date.now());
    return added.ok ? json(added.value, 201) : failure(added);
  });
}
