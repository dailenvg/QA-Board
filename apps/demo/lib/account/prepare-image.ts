import { encodeCanvas } from "../image";
import {
  IMAGE_MAX_BYTES,
  imageCrop,
  imageSizeError,
  isImageType,
  SOURCE_MAX_BYTES,
  type ImageKind,
} from "./image-rules";

/**
 * Readies a picked file for upload as an avatar or logo, in the browser: an
 * avatar center-cropped square, a logo whole, both scaled down to fit 512 px
 * and re-encoded on a canvas (which also drops whatever metadata the file
 * carried). The server checks the result again (`image-check.ts`).
 */

export type PreparedImage = { ok: true; blob: Blob } | { ok: false; error: string };

const UNREADABLE = "That image couldn't be read. Try another file.";
const NO_CANVAS = "This browser couldn't process the image. Try again in a different browser.";

/** Why `file` can't be used before reading it, or null. */
export function sourceFileError(file: File): string | null {
  if (!isImageType(file.type)) return "Use a PNG, JPG or WebP image.";
  if (file.size > SOURCE_MAX_BYTES) return "That image is over 15 MB. Try a smaller one.";
  return null;
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type));
}

/**
 * A logo stays a PNG, so its transparency survives and link preview cards
 * can draw it; one that's still over 1 MB as a PNG goes the way photos do.
 * An avatar is a photo: WebP (else JPEG), quality stepping down to fit.
 */
async function encode(canvas: HTMLCanvasElement, kind: ImageKind): Promise<Blob | null> {
  if (kind === "logo") {
    const png = await toBlob(canvas, "image/png");
    if (png && png.type === "image/png" && png.size <= IMAGE_MAX_BYTES) return png;
  }
  return (await encodeCanvas(canvas, IMAGE_MAX_BYTES))?.blob ?? null;
}

export async function prepareImage(file: File, kind: ImageKind): Promise<PreparedImage> {
  const problem = sourceFileError(file);
  if (problem) return { ok: false, error: problem };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, error: UNREADABLE };
  }
  try {
    const crop = imageCrop(kind, bitmap.width, bitmap.height);
    const sizeProblem = imageSizeError(kind, crop.dw, crop.dh);
    if (sizeProblem) return { ok: false, error: sizeProblem };
    const canvas = document.createElement("canvas");
    canvas.width = crop.dw;
    canvas.height = crop.dh;
    const context = canvas.getContext("2d");
    if (!context) return { ok: false, error: NO_CANVAS };
    // A photo has no transparency to keep: white under it, so JPEG never turns it black.
    if (kind === "avatar") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, crop.dw, crop.dh);
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.dw, crop.dh);
    const blob = await encode(canvas, kind);
    return blob ? { ok: true, blob } : { ok: false, error: NO_CANVAS };
  } finally {
    bitmap.close();
  }
}
