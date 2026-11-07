import { MB, SHARE_LIMITS } from "../share/limits";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Every size and count the workspace API accepts. Field lengths match a share's. */
export const WORKSPACE_LIMITS = {
  folderName: 80,
  projectName: SHARE_LIMITS.projectName,
  label: 40,
  author: SHARE_LIMITS.author,
  body: SHARE_LIMITS.body,
  fileName: SHARE_LIMITS.fileName,
  url: SHARE_LIMITS.url,
  pages: SHARE_LIMITS.pages,
  pageEdge: SHARE_LIMITS.pageEdge,
  /** JSON bodies other than an import. */
  jsonBytes: SHARE_LIMITS.jsonBytes,
  /** One import: a whole browser's data, under Vercel's 4.5 MB request limit. */
  importBytes: 4 * MB,
  importFolders: 500,
  importProjects: 500,
  importSnapshots: 10_000,
  importComments: 50_000,
  /** Largest file of each kind; `image` is a page picture from before pages. */
  blobBytes: {
    page: SHARE_LIMITS.blobBytes.page,
    image: SHARE_LIMITS.blobBytes.page,
    snapshot: SHARE_LIMITS.blobBytes.snapshot,
    crop: SHARE_LIMITS.blobBytes.crop,
  },
} as const;

/** Image types a workspace stores (what `sniffImageType` recognizes). */
export const BLOB_CONTENT_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

/** A client upload token is good for this long. */
export const UPLOAD_TOKEN_MS = 10 * 60 * 1000;

/** A project stays in the trash this long before the daily cron deletes it for good. */
export const TRASH_GRACE_MS = 30 * DAY_MS;

/**
 * A file under `ws/` with no row is swept once this old: well past its upload
 * token, so an upload still waiting for its commit is never touched.
 */
export const UNCOMMITTED_BLOB_MS = DAY_MS;
