export const MB = 1024 * 1024;

/** Every size and length a share accepts (shared by server validation and browser trimming). */
export const SHARE_LIMITS = {
  projectName: 80,
  author: 80,
  body: 5000,
  fileName: 255,
  url: 2048,
  snapshots: 200,
  comments: 1000,
  /** Pages of one project (the browser's `MAX_PAGES`). */
  pages: 50,
  /** Longest page edge in px the server accepts (pages are stored at 2400 px at most). */
  pageEdge: 10_000,
  /** JSON bodies (state pushes, comment metadata). */
  jsonBytes: 1 * MB,
  blobBytes: { crop: 2 * MB, snapshot: 8 * MB, page: 15 * MB },
  totalBytes: 40 * MB,
  /**
   * Largest image body in one request or response. Vercel Functions refuse
   * bodies over 4.5 MB, so bigger images travel in parts (uploads) or
   * byte ranges (downloads) of at most this size.
   */
  transferBytes: 4 * MB,
  /** Largest batch of owner changes the browser sends in one request (well under `jsonBytes`). */
  changeBatchBytes: 512 * 1024,
} as const;
