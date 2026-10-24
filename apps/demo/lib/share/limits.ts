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
  /** JSON bodies (state pushes, comment metadata). */
  jsonBytes: 1 * MB,
  blobBytes: { crop: 2 * MB, snapshot: 8 * MB, image: 15 * MB },
  totalBytes: 40 * MB,
  /**
   * Largest image body in one request or response. Vercel Functions refuse
   * bodies over 4.5 MB, so bigger images travel in parts (uploads) or
   * byte ranges (downloads) of at most this size.
   */
  transferBytes: 4 * MB,
} as const;
