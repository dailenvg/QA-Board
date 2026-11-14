import { headers } from "next/headers";
import type { ReactElement } from "react";
import { rateLimit } from "@/lib/share/http";
import { LINK_PREVIEW_TYPE, renderLinkPreview } from "./render-link-preview";

/**
 * A few minutes in the requester's own cache, never a shared one, so no CDN of
 * ours serves a renamed project or a revoked link's old card. Unfurlers keep
 * their own copies, which we can't expire.
 */
export const CARD_HEADERS = { "cache-control": "private, max-age=300" };

/** A fallback card's name: the shared review card, or Squint's main card. */
type FallbackName = "shared-review" | "main";

const holder = globalThis as typeof globalThis & {
  squintFallbackCards?: Map<FallbackName, Promise<Uint8Array>>;
};

/**
 * A fallback card's PNG, rendered once per server instance: the same bytes
 * as its static route (/s/opengraph-image, /opengraph-image), so answering
 * with them costs no render.
 */
function fallbackBytes(
  name: FallbackName,
  card: () => ReactElement,
  cardVersion: number,
): Promise<Uint8Array> {
  const cards = (holder.squintFallbackCards ??= new Map<FallbackName, Promise<Uint8Array>>());
  const cached = cards.get(name);
  if (cached) return cached;
  const rendered = renderLinkPreview(card(), { cardVersion })
    .then(async (response) => new Uint8Array(await response.arrayBuffer()))
    .catch((error: unknown) => {
      cards.delete(name);
      throw error;
    });
  cards.set(name, rendered);
  return rendered;
}

/** A fallback card's bytes as an image response, kept privately as every card is. */
export async function fallbackCard(
  name: FallbackName,
  card: () => ReactElement,
  cardVersion: number,
): Promise<Response> {
  const bytes = await fallbackBytes(name, card, cardVersion);
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": LINK_PREVIEW_TYPE, ...CARD_HEADERS },
  });
}

/** Whether this caller has asked for more per-link cards than a minute allows. */
export async function overCardLimit(): Promise<boolean> {
  const request = new Request("http://card.invalid/", { headers: await headers() });
  return rateLimit(request, "card") !== null;
}
