import type { Metadata } from "next";
import { MAIN_PREVIEW, previewMetadata, teamReviewPreview } from "./link-preview";
import { projectIconPath } from "./share/brand";
import type { ProjectPreview } from "./workspace/project-preview";

type OpenGraphImages = NonNullable<Metadata["openGraph"]>["images"];
type TwitterImages = NonNullable<Metadata["twitter"]>["images"];

interface ProjectLinkMetadataInput {
  projectId: string;
  /** The project's preview, or null (unknown, in the trash, archived, its workspace closed). */
  preview: ProjectPreview | null;
  /** Whether the request carries a live session: the team's own browser, not an unfurler. */
  signedIn: boolean;
  /** The main card's images, as the root segment set them, for the generic preview. */
  inherited: { openGraph: OpenGraphImages; twitter: TwitterImages };
}

const NOT_INDEXED: Metadata["robots"] = { index: false, follow: false };

/**
 * The page's own: never indexed. Signed out, its address (the project's id)
 * is never sent on as a referrer either. Not for the signed-in viewer: a
 * no-referrer page's own posts carry `Origin: null`, which the app's routes
 * refuse as cross-site.
 */
function pageMetadata(signedIn: boolean): Metadata {
  return signedIn
    ? { title: "Review", robots: NOT_INDEXED }
    : { title: "Sign in", robots: NOT_INDEXED, referrer: "no-referrer" };
}

/**
 * A project link's metadata. Signed out, a live project previews as its
 * company's card (the project's and the company's names, the company's icon,
 * and this segment's per-project card, which Next adds because no images are
 * named here). Anything else (an id that doesn't open, or a signed-in
 * browser, which unfurls nothing) gets Squint's main preview with the main
 * card named outright, which keeps the per-project card off the page: the
 * same answer for an unknown id as for a closed project.
 */
export function projectLinkMetadata({
  projectId,
  preview,
  signedIn,
  inherited,
}: ProjectLinkMetadataInput): Metadata {
  const page = pageMetadata(signedIn);
  if (signedIn || !preview) {
    const { openGraph, twitter } = previewMetadata(MAIN_PREVIEW);
    return {
      ...page,
      openGraph: { ...openGraph, images: inherited.openGraph },
      twitter: { ...twitter, images: inherited.twitter },
    };
  }
  const { openGraph, twitter } = previewMetadata(teamReviewPreview(preview));
  const brand = { name: preview.company, color: preview.color, logoVersion: preview.logoVersion };
  // One object each: Next writes each list's `rel` onto its icons.
  const icon = () => ({
    url: projectIconPath(projectId, brand),
    type: "image/png",
    sizes: "192x192",
  });
  return {
    ...page,
    openGraph: { ...openGraph, siteName: preview.company },
    twitter,
    icons: { icon: [icon()], apple: [icon()] },
  };
}
