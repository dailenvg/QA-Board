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

/** A client's shared review link. Unknown and revoked tokens are a plain 404. */
export default async function SharedReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { store } = await shareServices();
  const share = await clientShare(store, token);
  if (!share) notFound();
  return <SharedReview token={token} initial={await clientView(store, share)} />;
}
