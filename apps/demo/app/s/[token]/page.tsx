import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedReview } from "@/components/share/SharedReview";
import { shareServices } from "@/lib/share/server";
import { clientShare, clientView } from "@/lib/share/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared review",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** What the link's client sees, or null when its token is unknown, revoked or expired. */
async function openShare(token: string) {
  const { store } = await shareServices();
  const share = await clientShare(store, token, Date.now());
  return share && clientView(store, share);
}

/** A client's shared review link. Unknown, revoked and expired tokens are a plain 404. */
export default async function SharedReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await openShare(token);
  if (!view) notFound();
  return <SharedReview token={token} initial={view} />;
}
