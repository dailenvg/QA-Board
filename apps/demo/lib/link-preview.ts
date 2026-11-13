import type { Metadata } from "next";

/**
 * Link preview copy and Open Graph defaults (Slack, iMessage, X, LinkedIn).
 * A workspace's review link previews as its invitation: the company, the
 * client it's for (when its owner named one) and the project's name,
 * password-protected or not (a deliberate choice: the person
 * sharing a link chooses the channel it unfurls in, and the name is all a
 * protected link shows before its password). Anonymous links keep the generic
 * preview. Never a token, an id or an address in the copy.
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

/** A workspace's review link: who invites whom, and to review what. */
export interface Invitation {
  company: string;
  project: string;
  /** Who the link is for, as its owner named them; null: "you". */
  client: string | null;
}

/**
 * The alt text of a workspace link's card. The same for every link: the card's
 * image file exports it as is, which keeps the card's URL to the token alone.
 */
export const INVITATION_CARD_ALT =
  "An invitation to review, naming the company, the project and, when the link has one, the client. Squiggy, the blue Squint mascot, leans in among comment pins.";

/** The preview of a workspace's review link. */
export function invitationPreview({ company, project, client }: Invitation): LinkPreviewCopy {
  return {
    title: `${company} invited ${client ?? "you"} to review ${project}`,
    description: `Open the link, drop a pin and leave ${company} a comment. No account needed.`,
    alt: INVITATION_CARD_ALT,
  };
}

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
