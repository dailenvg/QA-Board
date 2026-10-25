import { z } from "zod";
import { SHARE_LIMITS } from "./limits";

export { SHARE_LIMITS } from "./limits";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const time = z.number().int().nonnegative();
const percent = z.number().finite().min(0).max(100);
const httpUrl = z
  .string()
  .max(SHARE_LIMITS.url)
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Only http and https addresses");
const text = (max: number) => z.string().trim().min(1).max(max);

const rect = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

const edge = z.number().int().min(1).max(SHARE_LIMITS.pageEdge);

const pageSchema = z
  .object({
    id,
    name: text(SHARE_LIMITS.fileName),
    width: edge.optional(),
    height: edge.optional(),
  })
  .refine((page) => (page.width === undefined) === (page.height === undefined), {
    message: "Width and height come together",
  });

const pagesSchema = z
  .array(pageSchema)
  .min(1)
  .max(SHARE_LIMITS.pages)
  .refine((pages) => new Set(pages.map((page) => page.id)).size === pages.length, {
    message: "Page ids are unique",
  });

export const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), url: httpUrl }),
  z.object({
    kind: z.literal("pages"),
    origin: z.enum(["image", "pdf"]),
    fileName: text(SHARE_LIMITS.fileName),
    referenceUrl: httpUrl.optional(),
    pages: pagesSchema,
  }),
]);

export const projectSchema = z.object({
  name: text(SHARE_LIMITS.projectName),
  source: sourceSchema,
});

export const snapshotSchema = z.object({
  id,
  width: z.number().int().min(1).max(2560),
  height: z.number().int().min(1).max(16_000),
  createdAt: time,
  sourceUrl: httpUrl,
  scale: z.number().positive().max(1).optional(),
});

const commentFields = {
  id,
  x: percent,
  y: percent,
  body: text(SHARE_LIMITS.body),
  author: text(SHARE_LIMITS.author),
  snapshotId: id.optional(),
  pageId: id.optional(),
  crop: z.object({ rect }).optional(),
};

/** A comment as the owner pushes it: any status, the owner's timestamps. */
export const commentSchema = z.object({
  ...commentFields,
  status: z.enum(["active", "resolved"]),
  createdAt: time,
  updatedAt: time,
  resolvedAt: time.optional(),
});

export const stateSchema = z.object({
  project: projectSchema,
  snapshots: z.array(snapshotSchema).max(SHARE_LIMITS.snapshots),
  comments: z.array(commentSchema).max(SHARE_LIMITS.comments),
});

/**
 * A batch of owner changes: upserts, and deletes the server applies only to
 * rows the owner has seen (its own, and client rows up to `cursor`).
 */
export const changeSchema = z.object({
  project: projectSchema.optional(),
  snapshots: z.array(snapshotSchema).max(SHARE_LIMITS.snapshots).default([]),
  comments: z.array(commentSchema).max(SHARE_LIMITS.comments).default([]),
  deleteSnapshots: z.array(id).max(SHARE_LIMITS.snapshots).default([]),
  deleteComments: z.array(id).max(SHARE_LIMITS.comments).default([]),
  cursor: z.number().int().nonnegative(),
});

/** A client's new comment. Status and timestamps are the server's to set. */
export const clientCommentSchema = z.object(commentFields);

export const captureSchema = z.object({ width: z.number().finite() });

/** `page:<pageId>`, `snapshot:<id>` or `crop:<commentId>`. */
export const blobKeySchema = z.string().regex(/^(page|snapshot|crop):[A-Za-z0-9_-]{1,64}$/);

export type BlobKind = keyof typeof SHARE_LIMITS.blobBytes;

export function blobKind(key: string): BlobKind {
  if (key.startsWith("page:")) return "page";
  return key.startsWith("snapshot:") ? "snapshot" : "crop";
}
