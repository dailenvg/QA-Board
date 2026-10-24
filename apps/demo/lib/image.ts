export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Longest stored edge. Large screenshots are scaled down so they fit in localStorage. */
const MAX_EDGE = 2400;
/** Target size of the stored data URL; quality steps down until it fits. */
const TARGET_CHARS = 1_600_000;
const QUALITIES = [0.86, 0.74, 0.62, 0.5];

export type ImageResult = { ok: true; dataUrl: string } | { ok: false; error: string };

export function validateImageFile(file: File): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "That file type isn't supported. Use a PNG, JPG, WebP or GIF image.";
  }
  if (file.size > MAX_IMAGE_BYTES) return "That image is over 15 MB. Try a smaller one.";
  return null;
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

function encode(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL("image/webp", quality);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
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
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    return {
      ok: false,
      error: "This browser couldn't process the image. Try again in a different browser.",
    };
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of QUALITIES) {
    const dataUrl = encode(canvas, quality);
    if (dataUrl.length <= TARGET_CHARS) return { ok: true, dataUrl };
  }
  return {
    ok: false,
    error: "That image is too detailed to store in this browser. Try a smaller one.",
  };
}
