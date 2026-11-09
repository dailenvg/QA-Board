/**
 * What an avatar or a workspace logo may be, for the browser that prepares it
 * (`prepare-image.ts`) and the route that stores it (`image-check.ts`), so
 * both say the same thing. No server imports: the uploaders bundle this.
 */

export type ImageKind = "avatar" | "logo";

/** The types stored, recognised by their first bytes on the server. No GIF: nothing animates. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/** For a file input's `accept`. */
export const IMAGE_ACCEPT = IMAGE_TYPES.join(",");

/**
 * Largest stored file. A link preview card draws a logo only up to this size
 * (`lib/share/brand-logo.ts`), so every logo that's stored can be drawn.
 */
export const IMAGE_MAX_BYTES = 1_000_000;

/** Longest edge, in px, of either kind: the browser resizes to this before uploading. */
export const IMAGE_MAX_EDGE = 512;

/** Shortest edge, in px: anything smaller is too small to read in any frame it's shown in. */
export const IMAGE_MIN_EDGE = 16;

/**
 * The longest a stored logo may be either way, for the server only. The browser
 * takes a picked file of any proportion into the crop step, which always saves
 * a square, so this guards uploads that skip that step (straight to the API).
 */
export const LOGO_MAX_ASPECT = 4;

/** Said of a picked file before cropping, and of an upload. */
export const IMAGE_TOO_SMALL = "That image is too small. Use a larger one.";

const LOGO_TOO_LONG = `Use a logo no more than ${LOGO_MAX_ASPECT} times as wide as it is tall, or the other way around.`;

/** Largest file the browser will start from, before resizing. */
export const SOURCE_MAX_BYTES = 15 * 1024 * 1024;

export function isImageType(type: string): type is ImageType {
  return (IMAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Why `width` × `height` can't be stored as `kind`, or null when it can: an
 * avatar is square, a logo at most 4:1 either way, and both have edges from
 * 16 to 512 px. What the browser uploads after the crop step is square, so it
 * always passes the proportion rules.
 */
export function imageSizeError(kind: ImageKind, width: number, height: number): string | null {
  if (Math.min(width, height) < IMAGE_MIN_EDGE) return IMAGE_TOO_SMALL;
  if (Math.max(width, height) > IMAGE_MAX_EDGE) {
    return `Images can be at most ${IMAGE_MAX_EDGE} × ${IMAGE_MAX_EDGE} px.`;
  }
  if (kind === "avatar" && width !== height) return "Photos must be square.";
  if (kind === "logo" && Math.max(width, height) > Math.min(width, height) * LOGO_MAX_ASPECT) {
    return LOGO_TOO_LONG;
  }
  return null;
}
