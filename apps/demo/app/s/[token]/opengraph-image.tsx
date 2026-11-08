import { renderInvitationCard } from "@/components/link-preview/render-invitation-card";
import {
  LINK_PREVIEW_SIZE,
  LINK_PREVIEW_TYPE,
} from "@/components/link-preview/render-link-preview";
import { INVITATION_CARD_ALT } from "@/lib/link-preview";

export const dynamic = "force-dynamic";
export const alt = INVITATION_CARD_ALT;
export const size = LINK_PREVIEW_SIZE;
export const contentType = LINK_PREVIEW_TYPE;

/**
 * A workspace's review link card. The page names it only for a workspace's
 * link (see its generateMetadata); it must sit in the page's own segment, or
 * Next drops it once the page sets `openGraph`.
 */
export default function InvitationImage({ params }: { params: { token: string } }) {
  return renderInvitationCard(params.token, { cardVersion: 2 });
}
