import { encodeCanvas } from "../image";
import { framedDraw, sourceSizeError, type Framing, type SourceSize } from "./image-framing";
import {
  IMAGE_MAX_BYTES,
  imageSizeError,
  isImageType,
  SOURCE_MAX_BYTES,
  type ImageKind,
} from "./image-rules";

/**
 * Readies a picked file for upload as an avatar or logo, in the browser: it's
 * checked and measured first (`readImageSize`), so the crop step only opens
 * for a file that can be used, then drawn square as the crop step framed it
 * and re-encoded on a canvas (which also drops whatever metadata the file
 * carried). The server checks the result again (`image-check.ts`).
 */

export type PreparedImage = { ok: true; blob: Blob } | { ok: false; error: string };

export type ReadImage = { ok: true; size: SourceSize } | { ok: false; error: string };

const UNREADABLE = "That image couldn't be read. Try another file.";
const NO_CANVAS = "This browser couldn't process the image. Try again in a different browser.";

/** Why `file` can't be used before reading it, or null. */
export function sourceFileError(file: File): string | null {
  if (!isImageType(file.type)) return "Use a PNG, JPG or WebP image.";
  if (file.size > SOURCE_MAX_BYTES) return "That image is over 15 MB. Try a smaller one.";
  return null;
}

/** The file decoded upright (as photos' EXIF orientation says), or null if it can't be. */
async function decode(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
}

/** The upright size of a picked file that can be cropped as `kind`, or why it can't. */
export async function readImageSize(file: File, kind: ImageKind): Promise<ReadImage> {
  const problem = sourceFileError(file);
  if (problem) return { ok: false, error: problem };
  const bitmap = await decode(file);
  if (!bitmap) return { ok: false, error: UNREADABLE };
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  const sizeProblem = sourceSizeError(kind, size);
  return sizeProblem ? { ok: false, error: sizeProblem } : { ok: true, size };
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

/** `file` drawn square as `framing` frames it (`framedDraw`), encoded for upload. */
export async function prepareImage(
  file: File,
  kind: ImageKind,
  framing: Framing,
): Promise<PreparedImage> {
  const problem = sourceFileError(file);
  if (problem) return { ok: false, error: problem };
  const bitmap = await decode(file);
  if (!bitmap) return { ok: false, error: UNREADABLE };
  try {
    const draw = framedDraw({ width: bitmap.width, height: bitmap.height }, framing);
    const sizeProblem = imageSizeError(kind, draw.side, draw.side);
    if (sizeProblem) return { ok: false, error: sizeProblem };
    const canvas = document.createElement("canvas");
    canvas.width = draw.side;
    canvas.height = draw.side;
    const context = canvas.getContext("2d");
    if (!context) return { ok: false, error: NO_CANVAS };
    // A photo has no transparency to keep: white under it, so JPEG never turns it black.
    // A logo's padding stays transparent.
    if (kind === "avatar") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, draw.side, draw.side);
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(
      bitmap,
      draw.sx,
      draw.sy,
      draw.sw,
      draw.sh,
      draw.dx,
      draw.dy,
      draw.dw,
      draw.dh,
    );
    const blob = await encode(canvas, kind);
    return blob ? { ok: true, blob } : { ok: false, error: NO_CANVAS };
  } finally {
    bitmap.close();
  }
}
