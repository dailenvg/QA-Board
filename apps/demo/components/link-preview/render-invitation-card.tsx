import { headers } from "next/headers";
import { rateLimit } from "@/lib/share/http";
import { invitationCard } from "@/lib/share/guest-share";
import { InvitationPreview } from "./InvitationPreview";
import { LINK_PREVIEW_TYPE, renderLinkPreview } from "./render-link-preview";
import { SharedReviewPreview } from "./SharedReviewPreview";

/**
 * A few minutes in the unfurler's own cache, never a shared one: a renamed
 * project or a revoked link shows on the next unfurl, not a year later.
 */
const CARD_HEADERS = { "cache-control": "private, max-age=300" };

const holder = globalThis as typeof globalThis & { squintGenericCard?: Promise<Uint8Array> };

/**
 * The generic card's PNG, rendered once per server instance: the same bytes
 * as /s/opengraph-image, so answering with them costs no render.
 */
function genericCardBytes(cardVersion: number): Promise<Uint8Array> {
  holder.squintGenericCard ??= renderLinkPreview(<SharedReviewPreview />, { cardVersion })
    .then(async (response) => new Uint8Array(await response.arrayBuffer()))
    .catch((error: unknown) => {
      holder.squintGenericCard = undefined;
      throw error;
    });
  return holder.squintGenericCard;
}

async function genericCard(cardVersion: number): Promise<Response> {
  const bytes = await genericCardBytes(cardVersion);
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": LINK_PREVIEW_TYPE, ...CARD_HEADERS },
  });
}

/** Whether this caller has asked for more per-link cards than a minute allows. */
async function overCardLimit(): Promise<boolean> {
  const request = new Request("http://card.invalid/", { headers: await headers() });
  return rateLimit(request, "card") !== null;
}

/**
 * The card for one review link, read on the server through its token: the
 * invitation for a workspace's link. An anonymous, unknown, revoked or
 * malformed link, or a caller over its limit, gets the generic card's bytes
 * (already rendered), so the image says nothing more than the page's 404
 * and a flood of made-up tokens never costs a render.
 */
export async function renderInvitationCard(
  token: string,
  { cardVersion }: { cardVersion: number },
): Promise<Response> {
  if (await overCardLimit()) return genericCard(cardVersion);
  const card = await invitationCard(token);
  if (!card) return genericCard(cardVersion);
  return renderLinkPreview(<InvitationPreview {...card} />, {
    cardVersion,
    headers: CARD_HEADERS,
  });
}
