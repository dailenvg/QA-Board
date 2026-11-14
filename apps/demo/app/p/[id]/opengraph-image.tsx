import { renderProjectCard } from "@/components/link-preview/render-project-card";
import {
  LINK_PREVIEW_SIZE,
  LINK_PREVIEW_TYPE,
} from "@/components/link-preview/render-link-preview";
import { TEAM_REVIEW_CARD_ALT } from "@/lib/link-preview";

export const dynamic = "force-dynamic";
export const alt = TEAM_REVIEW_CARD_ALT;
export const size = LINK_PREVIEW_SIZE;
export const contentType = LINK_PREVIEW_TYPE;

/**
 * A project link's card. The page names it only for a live project opened
 * signed out (see its generateMetadata); it must sit in the page's own
 * segment, or Next drops it once the page sets `openGraph`.
 */
export default function ProjectImage({ params }: { params: { id: string } }) {
  return renderProjectCard(params.id, { cardVersion: 5 });
}
