import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { SharedReview } from "@/components/share/SharedReview";
import { invitationPreview, previewMetadata, SHARED_REVIEW_PREVIEW } from "@/lib/link-preview";
import { invitationOf, openGuestShare } from "@/lib/share/guest-share";

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
 * A workspace's link previews as its invitation, with this segment's
 * per-token card; anonymous links and links that don't open, generically.
 */
export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { token } = await params;
  const invitation = invitationOf(await openGuestShare(token));
  const preview = invitation
    ? previewMetadata(invitationPreview(invitation))
    : await genericPreview(parent);
  return { ...PAGE_METADATA, ...preview };
}

/** A client's shared review link. Unknown, revoked and expired tokens are a plain 404. */
export default async function SharedReviewPage({ params }: Props) {
  const { token } = await params;
  const view = await openGuestShare(token);
  if (!view) notFound();
  return <SharedReview token={token} initial={view} />;
}
