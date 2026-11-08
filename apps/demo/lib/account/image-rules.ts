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
 * A logo sits in a square frame, letterboxed: one much wider (or taller)
 * than this shrinks to an unreadable strip.
 */
export const LOGO_MAX_ASPECT = 4;

/** Largest file the browser will start from, before resizing. */
export const SOURCE_MAX_BYTES = 15 * 1024 * 1024;

export function isImageType(type: string): type is ImageType {
  return (IMAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Why `width` × `height` can't be stored as `kind`, or null when it can: an
 * avatar is square, a logo at most 4:1 either way, and both have edges from
 * 16 to 512 px.
 */
export function imageSizeError(kind: ImageKind, width: number, height: number): string | null {
  if (Math.min(width, height) < IMAGE_MIN_EDGE) return "That image is too small. Use a larger one.";
  if (Math.max(width, height) > IMAGE_MAX_EDGE) {
    return `Images can be at most ${IMAGE_MAX_EDGE} × ${IMAGE_MAX_EDGE} px.`;
  }
  if (kind === "avatar" && width !== height) return "Photos must be square.";
  if (kind === "logo" && Math.max(width, height) > Math.min(width, height) * LOGO_MAX_ASPECT) {
    return `Use a logo no more than ${LOGO_MAX_ASPECT} times as wide as it is tall, or the other way around.`;
  }
  return null;
}

/** A part of a source image drawn at a size: `s*` in the source, `d*` on the canvas. */
export interface ImageCrop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dw: number;
  dh: number;
}

/**
 * What the browser draws from a `width` × `height` source: an avatar's
 * centered square, a logo whole; either scaled down (never up) to fit 512 px.
 */
export function imageCrop(kind: ImageKind, width: number, height: number): ImageCrop {
  if (kind === "avatar") {
    const side = Math.min(width, height);
    const out = Math.min(side, IMAGE_MAX_EDGE);
    return {
      sx: Math.floor((width - side) / 2),
      sy: Math.floor((height - side) / 2),
      sw: side,
      sh: side,
      dw: out,
      dh: out,
    };
  }
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(width, height));
  return {
    sx: 0,
    sy: 0,
    sw: width,
    sh: height,
    dw: Math.max(1, Math.round(width * scale)),
    dh: Math.max(1, Math.round(height * scale)),
  };
}
