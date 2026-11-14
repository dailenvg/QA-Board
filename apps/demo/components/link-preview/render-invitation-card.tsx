import { invitationCard } from "@/lib/share/guest-share";
import { CARD_HEADERS, fallbackCard, overCardLimit } from "./card-response";
import { InvitationPreview } from "./InvitationPreview";
import { renderLinkPreview } from "./render-link-preview";
import { SharedReviewPreview } from "./SharedReviewPreview";

const genericCard = (cardVersion: number) =>
  fallbackCard("shared-review", () => <SharedReviewPreview />, cardVersion);

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
