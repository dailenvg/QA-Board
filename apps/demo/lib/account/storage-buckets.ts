import { BLOB_KINDS, type BlobKind } from "../workspace/blob-paths";

/**
 * The kinds of file the Storage page breaks a workspace's usage into, in the
 * order it lists them. Every stored file is an image today, so a file's kind
 * comes from its path (`blob-paths.ts`) and its project, not its type: a page
 * of a project made from a PDF counts as a PDF. Videos join when projects can
 * hold them; anything else (the workspace's logo) is Other.
 */
export const STORAGE_BUCKETS = ["images", "pdfs", "snapshots", "crops", "videos", "other"] as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

/** What `bucketOf` reads of a file. */
export interface BucketInput {
  /** The `<kind>` of a project file's path (`ws/<ws>/project/<p>/<kind>/<id>`); null for any other path. */
  kind: string | null;
  /** Whether its content type is `video/*`. */
  video: boolean;
  /** Its project's `source.origin` (`image` or `pdf`); null for a website project or none. */
  origin: string | null;
}

function isBlobKind(kind: string | null): kind is BlobKind {
  return (BLOB_KINDS as readonly string[]).includes(kind ?? "");
}

export function bucketOf({ kind, video, origin }: BucketInput): StorageBucket {
  if (video) return "videos";
  if (!isBlobKind(kind)) return "other";
  if (kind === "snapshot") return "snapshots";
  if (kind === "crop") return "crops";
  return origin === "pdf" ? "pdfs" : "images";
}
