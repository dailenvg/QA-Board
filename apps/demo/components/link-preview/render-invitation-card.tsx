import type { ImageResponse } from "next/og";
import { invitationCard } from "@/lib/share/guest-share";
import { InvitationPreview } from "./InvitationPreview";
import { renderLinkPreview } from "./render-link-preview";
import { SharedReviewPreview } from "./SharedReviewPreview";

/**
 * A few minutes in the unfurler's own cache, never a shared one: a renamed
 * project or a revoked link shows on the next unfurl, not a year later.
 */
const CARD_HEADERS = { "cache-control": "private, max-age=300" };

/**
 * The card for one review link, read on the server through its token: the
 * invitation for a workspace's link, else the generic card, so the image
 * says nothing about an anonymous or dead link.
 */
export async function renderInvitationCard(
  token: string,
  { cardVersion }: { cardVersion: number },
): Promise<ImageResponse> {
  const card = await invitationCard(token);
  return renderLinkPreview(card ? <InvitationPreview {...card} /> : <SharedReviewPreview />, {
    cardVersion,
    headers: CARD_HEADERS,
  });
}
