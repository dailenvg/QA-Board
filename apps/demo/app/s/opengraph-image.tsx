import { SharedReviewPreview } from "@/components/link-preview/SharedReviewPreview";
import {
  LINK_PREVIEW_SIZE,
  LINK_PREVIEW_TYPE,
  renderLinkPreview,
} from "@/components/link-preview/render-link-preview";
import { SHARED_REVIEW_PREVIEW } from "@/lib/link-preview";

export const alt = SHARED_REVIEW_PREVIEW.alt;
export const size = LINK_PREVIEW_SIZE;
export const contentType = LINK_PREVIEW_TYPE;

/**
 * The shared review card for every /s/<token> link. It sits above the [token]
 * segment so it takes no params: one static image, no share lookup, and no
 * token in the image URL.
 */
export default function SharedReviewImage() {
  return renderLinkPreview(<SharedReviewPreview />, { cardVersion: 1 });
}
