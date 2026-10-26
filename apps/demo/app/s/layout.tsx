import type { Metadata } from "next";
import type { ReactNode } from "react";
import { previewMetadata, SHARED_REVIEW_PREVIEW } from "@/lib/link-preview";

/**
 * Link previews for every shared review link, generic on purpose: an unfurl
 * shows to the whole channel, so no project, client or token. Set here, beside
 * opengraph-image.tsx, because a segment that sets `openGraph` drops the
 * images a parent segment's image file adds.
 */
export const metadata: Metadata = previewMetadata(SHARED_REVIEW_PREVIEW);

export default function SharedLinksLayout({ children }: { children: ReactNode }) {
  return children;
}
