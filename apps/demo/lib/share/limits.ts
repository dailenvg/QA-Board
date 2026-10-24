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
} as const;
