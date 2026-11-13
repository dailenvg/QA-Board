import type { Metadata, ResolvingMetadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ShareGate } from "@/components/share/ShareGate";
import {
  invitationPreview,
  previewMetadata,
  SHARED_REVIEW_PREVIEW,
  type Invitation,
} from "@/lib/link-preview";
import { reviewerNameOf } from "@/lib/share-client/reviewer-name";
import { brandIconPath } from "@/lib/share/brand";
import { guestBrand, invitationOf, openGuestShare } from "@/lib/share/guest-share";
import type { ClientBrand } from "@/lib/share/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

const PAGE_METADATA: Metadata = {
  title: "Shared review",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * The generic preview, with the generic card the parent segment set
 * (/s/opengraph-image). Naming the images here keeps this segment's
 * per-token card (./opengraph-image.tsx) off the page: Next adds a segment's
 * image files only where its metadata names no images of its own.
 */
async function genericPreview(parent: ResolvingMetadata): Promise<Metadata> {
  const inherited = await parent;
  const { openGraph, twitter } = previewMetadata(SHARED_REVIEW_PREVIEW);
  return {
    openGraph: { ...openGraph, images: inherited.openGraph?.images ?? [] },
    twitter: { ...twitter, images: inherited.twitter?.images ?? [] },
  };
}

/**
 * A workspace's link previews as its invitation, under the company's name and
 * icon (its logo, or its monogram) rather than Squint's: chat apps show both
 * beside the card, and guests see the icon in their tab.
 */
function companyPreview(token: string, brand: ClientBrand, invitation: Invitation): Metadata {
  const { openGraph, twitter } = previewMetadata(invitationPreview(invitation));
  // One object each: Next writes each list's `rel` onto its icons.
  const icon = () => ({ url: brandIconPath(token, brand), type: "image/png", sizes: "192x192" });
  return {
    openGraph: { ...openGraph, siteName: brand.name },
    twitter,
    icons: { icon: [icon()], apple: [icon()] },
  };
}

/** The request's `Cookie` header, where a protected link's guest pass is. */
async function requestCookies(): Promise<string | null> {
  return (await headers()).get("cookie");
}

/**
 * A workspace's link previews as its invitation, with this segment's
 * per-token card and the company's name and icon, password-protected or not; anonymous links and links that
 * don't open, generically.
 */
export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { token } = await params;
  const guest = await openGuestShare(token, await requestCookies());
  const invitation = invitationOf(guest);
  const preview =
    guest && invitation
      ? companyPreview(token, guestBrand(guest), invitation)
      : await genericPreview(parent);
  return { ...PAGE_METADATA, ...preview };
}

/**
 * A client's shared review link. Unknown, revoked and expired tokens are a
 * plain 404; a password-protected link without a valid guest pass shows its
 * password screen, with the company's name and logo and the project's name,
 * and nothing else of the project. The reviewer's name for this link comes
 * from its cookie, so the page renders with it; it only fills in the name
 * field, never vouches for anyone.
 */
export default async function SharedReviewPage({ params }: Props) {
  const { token } = await params;
  const cookies = await requestCookies();
  const guest = await openGuestShare(token, cookies);
  if (!guest) notFound();
  const initial = guest.locked
    ? {
        locked: true as const,
        brand: guest.brand,
        projectName: guest.projectName,
        clientName: guest.clientName,
      }
    : { locked: false as const, view: guest.view };
  return <ShareGate token={token} initial={initial} authorName={reviewerNameOf(cookies)} />;
}
