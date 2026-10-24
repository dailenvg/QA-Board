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

export const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), url: httpUrl }),
  z.object({
    kind: z.literal("image"),
    fileName: text(SHARE_LIMITS.fileName),
    referenceUrl: httpUrl.optional(),
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
});

const commentFields = {
  id,
  x: percent,
  y: percent,
  body: text(SHARE_LIMITS.body),
  author: text(SHARE_LIMITS.author),
  snapshotId: id.optional(),
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

export const pushSchema = z.object({
  state: stateSchema,
  /** The owner's pull cursor: client additions up to here may be deleted by omission. */
  cursor: z.number().int().nonnegative(),
});

/** A client's new comment. Status and timestamps are the server's to set. */
export const clientCommentSchema = z.object(commentFields);

export const captureSchema = z.object({ width: z.number().finite() });

/** `image`, `snapshot:<id>` or `crop:<commentId>`. */
export const blobKeySchema = z.string().regex(/^(image|(snapshot|crop):[A-Za-z0-9_-]{1,64})$/);

export type BlobKind = keyof typeof SHARE_LIMITS.blobBytes;

export function blobKind(key: string): BlobKind {
  if (key === "image") return "image";
  return key.startsWith("snapshot:") ? "snapshot" : "crop";
}
