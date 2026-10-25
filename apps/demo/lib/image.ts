export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Longest stored edge of an uploaded image or a rendered PDF page. */
export const MAX_EDGE = 2400;
/** Target size of a stored picture; quality steps down until it fits. */
const TARGET_BYTES = 1_200_000;
const QUALITIES = [0.86, 0.74, 0.62, 0.5];

/** A prepared picture and its size in px. */
export type ImageResult =
  { ok: true; blob: Blob; width: number; height: number } | { ok: false; error: string };

const TOO_DETAILED = "That image is too detailed to store in this browser. Try a smaller one.";
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

/**
 * Encodes a canvas the way every stored picture is: WebP (else JPEG), its
 * quality stepping down until it's at most about 1.2 MB. Null when even the
 * lowest quality is too big, or the browser can't encode it.
 */
export async function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob | null> {
  for (const quality of QUALITIES) {
    const blob = await encode(canvas, quality);
    if (!blob) return null;
    if (blob.size <= TARGET_BYTES) return blob;
  }
  return null;
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
    return { ok: false, error: "That image couldn't be read. Try another file." };
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
  const blob = await encodeCanvas(canvas);
  return blob
    ? { ok: true, blob, width: canvas.width, height: canvas.height }
    : { ok: false, error: TOO_DETAILED };
}

/** Decodes a `data:` URL into a Blob (no network involved). */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}
