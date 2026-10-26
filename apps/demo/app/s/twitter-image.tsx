import { SharedReviewPreview } from "@/components/link-preview/SharedReviewPreview";
import { renderLinkPreview } from "@/components/link-preview/render-link-preview";

export { alt, contentType, size } from "./opengraph-image";

/** The shared review card for X. Rendered here, not re-exported, so a cardVersion bump changes this URL too. */
export default function SharedReviewTwitterImage() {
  return renderLinkPreview(<SharedReviewPreview />, { cardVersion: 1 });
}
