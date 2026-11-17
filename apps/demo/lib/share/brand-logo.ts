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
 * Larger logos are left off a page that inlines them, for the default mark: the
 * page ships the data URI twice (its HTML and its RSC payload), and the upload
 * cap alone would let that reach megabytes.
 */
export const PAGE_LOGO_MAX_BYTES = 250_000;

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
 * A team member's avatar on a review link, by their key on it
 * (`ShareStore.teamAvatar`), versioned as that link versions it: never
 * `logoVersion`, which is the same on every link. Null like `teamAvatar`,
 * and when the file is gone or isn't a bitmap image.
 */
export async function readTeamAvatar(
  store: ShareStore,
  shareId: string,
  key: string,
  driver?: Pick<BlobDriver, "read">,
): Promise<BrandLogo | null> {
  const found = await store.teamAvatar(shareId, key);
  const image = found && (await readStoredImage(found.blob, driver));
  return image && { ...image, version: found.version };
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

function dataUri(logo: BrandLogo): string {
  return `data:${logo.contentType};base64,${Buffer.from(logo.bytes).toString("base64")}`;
}

/** The logo as a data URI a link preview card can draw, or null when it can't. */
export function cardLogoUri(logo: BrandLogo): string | null {
  if (!CARD_TYPES.has(logo.contentType) || logo.bytes.length > CARD_LOGO_MAX_BYTES) return null;
  return dataUri(logo);
}

/** The logo as a data URI for a page to inline, or null (the default mark) when it's too large. */
export function pageLogoUri(logo: BrandLogo): string | null {
  return logo.bytes.length > PAGE_LOGO_MAX_BYTES ? null : dataUri(logo);
}

/**
 * How a browser keeps a versioned image (a logo, an avatar, the app's company
 * icon): privately for a few minutes when asked for at its `current`
 * version, never otherwise, so an old `?v=` never pins a stale picture.
 */
export function versionedCacheControl(current: boolean): string {
  return current ? `private, max-age=${LOGO_MAX_AGE_SECONDS}` : "private, no-store";
}

/**
 * The logo (or a signed-in user's avatar) for a browser: kept privately for a
 * few minutes when asked for at its current version, never cached otherwise,
 * never sniffed, inert if opened.
 */
export function brandLogoResponse(logo: BrandLogo, requestedVersion: string | null): Response {
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "content-type": logo.contentType,
      "cache-control": versionedCacheControl(requestedVersion === logo.version),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
