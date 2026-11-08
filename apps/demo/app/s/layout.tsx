import type { Metadata } from "next";
import type { ReactNode } from "react";
import { previewMetadata, SHARED_REVIEW_PREVIEW } from "@/lib/link-preview";

/**
 * The generic link preview, for anonymous review links and links that don't
 * open: no project, client or token. A workspace's link replaces it with its
 * invitation, naming the company and the project ([token]/page.tsx and its
 * per-token card). Set here, beside opengraph-image.tsx, because a segment
 * that sets `openGraph` drops the images a parent segment's image file adds.
 */
export const metadata: Metadata = previewMetadata(SHARED_REVIEW_PREVIEW);

export default function SharedLinksLayout({ children }: { children: ReactNode }) {
  return children;
}
