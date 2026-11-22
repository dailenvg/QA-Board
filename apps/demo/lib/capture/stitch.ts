import sharp from "sharp";
import type { RenderJpeg } from "./shrink-to-fit";
import type { Slice } from "./slices";

// libvips caches operations by their input. Every capture's slices are used once, so the
// cache would only hold on to memory a function is short of.
sharp.cache(false);

/** One band of the page and its screenshot. */
export interface SliceImage {
  slice: Slice;
  jpeg: Buffer;
}

/**
 * The slices' JPEGs, each exactly `width` x its slice's height. At device
 * scale factor 1 they already are; one that isn't is stretched to fit, so the
 * stack below lines up.
 */
export async function sizedSlices(shots: readonly SliceImage[], width: number): Promise<Buffer[]> {
  return Promise.all(
    shots.map(async ({ slice, jpeg }) => {
      const { width: w, height: h } = await sharp(jpeg).metadata();
      if (w === width && h === slice.height) return jpeg;
      return sharp(jpeg)
        .resize(width, slice.height, { fit: "fill" })
        .jpeg({ quality: 95 })
        .toBuffer();
    }),
  );
}

/**
 * Encodes slices stacked top to bottom (`sizedSlices`) as one JPEG of `width`
 * x `height` CSS px, resized by `scale` when it's below 1. libvips joins them
 * as it encodes, reading each slice once in order, so there's no raw canvas of
 * the whole page: a 2560 x 16000 page peaked about 230 MB above the process's
 * baseline locally, against about 450 MB with one.
 */
export function slicesRenderer(
  jpegs: readonly Buffer[],
  width: number,
  height: number,
): RenderJpeg {
  return (scale, quality) => {
    const stacked =
      jpegs.length === 1
        ? sharp(jpegs[0], { sequentialRead: true })
        : sharp([...jpegs], { sequentialRead: true, join: { across: 1, valign: "top" } });
    // The last slice is shorter than the rest, and a join pads it to their height.
    const page = stacked.extract({ left: 0, top: 0, width, height });
    const sized =
      scale < 1
        ? page.resize(
            Math.max(1, Math.round(width * scale)),
            Math.max(1, Math.round(height * scale)),
            { fit: "fill" },
          )
        : page;
    return sized.jpeg({ quality }).toBuffer();
  };
}
