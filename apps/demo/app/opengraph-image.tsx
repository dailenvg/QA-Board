import { MainPreview } from "@/components/link-preview/MainPreview";
import {
  LINK_PREVIEW_SIZE,
  LINK_PREVIEW_TYPE,
  renderLinkPreview,
} from "@/components/link-preview/render-link-preview";
import { MAIN_PREVIEW } from "@/lib/link-preview";

export const alt = MAIN_PREVIEW.alt;
export const size = LINK_PREVIEW_SIZE;
export const contentType = LINK_PREVIEW_TYPE;

/** The main Squint card, generated once at build time. Every page without its own inherits it. */
export default function OpenGraphImage() {
  return renderLinkPreview(<MainPreview />, { cardVersion: 1 });
}
