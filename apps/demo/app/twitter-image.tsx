import { MainPreview } from "@/components/link-preview/MainPreview";
import { renderLinkPreview } from "@/components/link-preview/render-link-preview";

export { alt, contentType, size } from "./opengraph-image";

/** The main card for X. Rendered here, not re-exported, so a cardVersion bump changes this URL too. */
export default function TwitterImage() {
  return renderLinkPreview(<MainPreview />, { cardVersion: 1 });
}
