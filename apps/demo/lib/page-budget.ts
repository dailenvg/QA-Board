import { fitPicture, MAX_PICTURE_BYTES, type EncodedPicture } from "./image";
import { SHARE_LIMITS } from "./share/limits";

/**
 * What a project's pages may take of a share's 40 MB: 32 MB, leaving 8 MB for
 * snapshots and comment screenshots. Any project of up to 50 pages fits.
 */
export const PAGES_SHARE_BYTES = SHARE_LIMITS.totalBytes * 0.8;

/**
 * The most one page of a `pageCount`-page project is stored at: the usual
 * 1.2 MB up to 27 pages, then an even share of `PAGES_SHARE_BYTES` (about
 * 671 KB each at 50 pages). A single image keeps its full quality.
 */
export function pageByteBudget(pageCount: number): number {
  return Math.min(MAX_PICTURE_BYTES, Math.floor(PAGES_SHARE_BYTES / Math.max(1, pageCount)));
}

export type FittedPages<T> = { ok: true; pictures: T[] } | { ok: false; index: number };

/**
 * Pictures made the pages of one project, each within its share of the
 * budget: those already small enough stay as they are, the rest are
 * re-encoded. Fails at the first one that can't fit (0-based `index`).
 */
export async function fitPages<T extends EncodedPicture>(
  pictures: readonly T[],
  fit: (picture: T, maxBytes: number) => Promise<T | null> = fitPicture,
): Promise<FittedPages<T>> {
  const budget = pageByteBudget(pictures.length);
  const fitted: T[] = [];
  for (const [index, picture] of pictures.entries()) {
    const result = picture.blob.size <= budget ? picture : await fit(picture, budget);
    if (!result) return { ok: false, index };
    fitted.push(result);
  }
  return { ok: true, pictures: fitted };
}
