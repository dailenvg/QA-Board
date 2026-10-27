import type { Metadata } from "next";

/**
 * Link preview copy and Open Graph defaults (Slack, iMessage, X, LinkedIn).
 * Unfurls show to whole channels, so a shared review's preview stays generic:
 * never a project, client or token.
 */

export const SITE_NAME = "Squint";

export interface LinkPreviewCopy {
  title: string;
  description: string;
  /** Alt text for the generated card image. */
  alt: string;
}

export const MAIN_PREVIEW: LinkPreviewCopy = {
  title: "Squint: pin feedback on any website, image or PDF",
  description:
    "Drop a pin, leave a comment and resolve it when it's done. Clients review from a link. No account needed.",
  alt: "Squint: pin feedback on any website, image or PDF. Squiggy, the blue Squint mascot, stands among numbered comment pins and a resolved check.",
};

export const SHARED_REVIEW_PREVIEW: LinkPreviewCopy = {
  title: "You're invited to review",
  description: "Open the link, drop a pin and leave a comment. No account needed.",
  alt: "Squint: you're invited to review. Drop a pin, leave a comment. Squiggy, the blue Squint mascot, leans in among comment pins.",
};

/** Open Graph fields every page shares. A segment that sets `openGraph` replaces its parent's. */
const OPEN_GRAPH_BASE = {
  type: "website",
  siteName: SITE_NAME,
  locale: "en_US",
} as const satisfies Metadata["openGraph"];

/** Open Graph and Twitter metadata for one preview's copy. */
export function previewMetadata(copy: LinkPreviewCopy): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: { ...OPEN_GRAPH_BASE, title: copy.title, description: copy.description },
    twitter: { card: "summary_large_image", title: copy.title, description: copy.description },
  };
}
