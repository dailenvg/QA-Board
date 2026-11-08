import { blobDriverFromEnv, type BlobDriver } from "../workspace/blob-driver";
import { logoVersion } from "./brand";
import { sniffImageType } from "./sniff";
import type { ShareStore } from "./store";
import type { StoredBlob } from "./types";

export interface BrandLogo {
  bytes: Uint8Array;
  /** From the file's first bytes, not the type it was stored with. */
  contentType: string;
  /** `logoVersion` of its key: what the guest's `?v=` should say. */
  version: string;
}

/** How long a guest's browser keeps the logo at its current `?v=`. Never a shared cache. */
export const LOGO_MAX_AGE_SECONDS = 300;

/** Types a link preview card can draw (satori reads PNG, JPEG and GIF bitmaps, not WebP). */
const CARD_TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);

/** Larger logos are left off the card rather than inlined into it. */
const CARD_LOGO_MAX_BYTES = 1_000_000;

/**
 * The logo of the share's workspace, read through the workspace blob driver
 * (Vercel Blob's private store, or the row's bytes locally). Null without a
 * logo, when its file is gone, or when it isn't a bitmap image.
 */
export async function readBrandLogo(
  store: ShareStore,
  shareId: string,
  driver?: Pick<BlobDriver, "read">,
): Promise<BrandLogo | null> {
  const stored = await store.brandLogo(shareId);
  return stored && readStoredImage(stored, driver);
}

/**
 * A stored image row's file (a logo, an avatar), read through the workspace
 * blob driver and versioned by its key. Null when the file is gone or isn't
 * a bitmap image.
 */
export async function readStoredImage(
  stored: Pick<StoredBlob, "key" | "location">,
  driver?: Pick<BlobDriver, "read">,
): Promise<BrandLogo | null> {
  const bytes = await (driver ?? blobDriverFromEnv()).read(stored.location);
  const contentType = bytes ? sniffImageType(bytes) : null;
  if (!bytes || !contentType) return null;
  return { bytes, contentType, version: logoVersion(stored.key) };
}

/** The logo as a data URI a link preview card can draw, or null when it can't. */
export function cardLogoUri(logo: BrandLogo): string | null {
  if (!CARD_TYPES.has(logo.contentType) || logo.bytes.length > CARD_LOGO_MAX_BYTES) return null;
  return `data:${logo.contentType};base64,${Buffer.from(logo.bytes).toString("base64")}`;
}

/**
 * The logo (or a signed-in user's avatar) for a browser: kept privately for a
 * few minutes when asked for at its current version, never cached otherwise,
 * never sniffed, inert if opened.
 */
export function brandLogoResponse(logo: BrandLogo, requestedVersion: string | null): Response {
  const current = requestedVersion === logo.version;
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "content-type": logo.contentType,
      "cache-control": current ? `private, max-age=${LOGO_MAX_AGE_SECONDS}` : "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
