import { ImageResponse } from "next/og";
import type { ReactElement } from "react";
import { linkPreviewFonts } from "./link-preview-fonts";

/** The size Open Graph and X large cards expect. */
export const LINK_PREVIEW_SIZE = { width: 1200, height: 630 };
export const LINK_PREVIEW_TYPE = "image/png";

/**
 * Bump when the card art changes, then update the `cardVersion` each image route passes.
 * Image URLs carry a hash of the route file's own source, so only an edit there busts caches.
 */
const CARD_VERSION = 1;

/**
 * A link preview card as a 1200×630 PNG. Fails the build when a route's
 * `cardVersion` is behind CARD_VERSION, so no route keeps serving a stale URL.
 */
export async function renderLinkPreview(
  card: ReactElement,
  { cardVersion }: { cardVersion: number },
): Promise<ImageResponse> {
  if (cardVersion !== CARD_VERSION) {
    throw new Error(
      `This image route passes cardVersion ${cardVersion}, but CARD_VERSION is ${CARD_VERSION}. Update the route so its image URL changes.`,
    );
  }
  return new ImageResponse(card, { ...LINK_PREVIEW_SIZE, fonts: await linkPreviewFonts() });
}
