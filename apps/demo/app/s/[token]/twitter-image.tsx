import { renderInvitationCard } from "@/components/link-preview/render-invitation-card";

export { alt, contentType, size } from "./opengraph-image";
export const dynamic = "force-dynamic";

/** The invitation card for X. Rendered here, not re-exported, so a cardVersion bump changes this URL too. */
export default function InvitationTwitterImage({ params }: { params: { token: string } }) {
  return renderInvitationCard(params.token, { cardVersion: 2 });
}
