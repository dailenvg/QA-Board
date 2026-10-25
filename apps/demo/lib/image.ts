export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Longest stored edge of an uploaded image or a rendered PDF page. */
export const MAX_EDGE = 2400;
/** Largest stored picture; quality steps down until it fits (pages of long projects get less). */
export const MAX_PICTURE_BYTES = 1_200_000;
const QUALITIES = [0.86, 0.74, 0.62, 0.5, 0.4];
/** Scale steps when even the lowest quality is too big, down to this longest edge. */
const DOWNSCALE = 0.8;
const MIN_EDGE = 1000;

/** An encoded picture and its size in px. */
export interface EncodedPicture {
  blob: Blob;
  width: number;
  height: number;
}

/** A prepared picture and its size in px. */
export type ImageResult =
  { ok: true; blob: Blob; width: number; height: number } | { ok: false; error: string };

const TOO_DETAILED = "That image is too detailed to store in this browser. Try a smaller one.";
const UNREADABLE = "That image couldn't be read. Try another file.";
const NO_CANVAS = "This browser couldn't process the image. Try again in a different browser.";

export function validateImageFile(file: File): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "That file type isn't supported. Use a PNG, JPG, WebP or GIF image.";
  }
  if (file.size > MAX_IMAGE_BYTES) return "That image is over 15 MB. Try a smaller one.";
  return null;
}

/** The scale that fits `width` × `height` within `MAX_EDGE`, never above `limit`. */
export function fitScale(width: number, height: number, limit = 1): number {
  return Math.min(limit, MAX_EDGE / Math.max(width, height));
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** WebP, or JPEG where the browser can't write WebP (it falls back to PNG then). */
async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  const webp = await toBlob(canvas, "image/webp", quality);
  if (webp?.type === "image/webp") return webp;
  return toBlob(canvas, "image/jpeg", quality);
}

/** Draws `source` onto a new white canvas `scale` times its size. */
function scaled(source: CanvasImageSource & { width: number; height: number }, scale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Encodes a canvas the way every stored picture is: WebP (else JPEG), at most
 * `maxBytes` (1.2 MB unless a long project's pages share less). Quality steps
 * down first; if even the lowest is too big, the picture is drawn smaller,
 * step by step, down to a 1000 px longest edge. Null when it still doesn't
 * fit, or the browser can't encode it.
 */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  maxBytes = MAX_PICTURE_BYTES,
): Promise<EncodedPicture | null> {
  let current: HTMLCanvasElement | null = canvas;
  while (current) {
    for (const quality of QUALITIES) {
      const blob = await encode(current, quality);
      if (!blob) return null;
      if (blob.size <= maxBytes) return { blob, width: current.width, height: current.height };
    }
    if (Math.max(current.width, current.height) * DOWNSCALE < MIN_EDGE) return null;
    const next = scaled(current, DOWNSCALE);
    if (current !== canvas) {
      // Hand each step's bitmap back at once.
      current.width = 0;
      current.height = 0;
    }
    current = next;
  }
  return null;
}

/**
 * The same picture, re-encoded within `maxBytes` (a page of a long project).
 * Null when it can't be read or doesn't fit.
 */
export async function fitPicture<T extends EncodedPicture>(
  picture: T,
  maxBytes: number,
): Promise<T | null> {
  if (picture.blob.size <= maxBytes) return picture;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(picture.blob);
  } catch {
    return null;
  }
  const canvas = scaled(bitmap, 1);
  bitmap.close();
  const encoded = canvas ? await encodeCanvas(canvas, maxBytes) : null;
  return encoded ? { ...picture, ...encoded } : null;
}

/**
 * Decodes an image file and re-encodes it at a storable size. GIFs keep only
 * their first frame; transparent areas are flattened onto white.
 */
export async function prepareImage(file: File): Promise<ImageResult> {
  const invalid = validateImageFile(file);
  if (invalid) return { ok: false, error: invalid };
  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch {
    return { ok: false, error: UNREADABLE };
  }
  const scale = fitScale(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return { ok: false, error: NO_CANVAS };
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const encoded = await encodeCanvas(canvas);
  return encoded ? { ok: true, ...encoded } : { ok: false, error: TOO_DETAILED };
}

/** Decodes a `data:` URL into a Blob (no network involved). */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}
