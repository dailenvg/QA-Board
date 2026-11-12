import { z } from "zod";
import { REVIEW_WINDOWS } from "../share/review-window";
import { isSecretShape } from "../share/tokens";
import { BLOB_CONTENT_TYPES, WORKSPACE_LIMITS as LIMITS } from "./limits";

/**
 * Every field the workspace API accepts. Ids come from the browser (random
 * UUIDs, `page-1`, the legacy folder `default`), so they're limited to what's
 * safe in a URL segment and a blob path.
 */

export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const time = z.number().int().nonnegative();
const percent = z.number().finite().min(0).max(100);
const text = (max: number) => z.string().trim().min(1).max(max);
const httpUrl = z
  .string()
  .max(LIMITS.url)
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Only http and https addresses");
const secret = z.string().refine(isSecretShape, "invalid secret");

/** A file's key as the browser store names it: `page:<id>`, `image:<projectId>`, `snapshot:<id>`, `crop:<commentId>`. */
export const blobKeySchema = z.string().regex(/^(page|image|snapshot|crop):[A-Za-z0-9_-]{1,64}$/);

const rect = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

const edge = z.number().int().min(1).max(LIMITS.pageEdge);

export const pageSchema = z
  .object({
    id: idSchema,
    blobKey: blobKeySchema,
    name: text(LIMITS.fileName),
    width: edge.optional(),
    height: edge.optional(),
    rev: z.number().int().min(1).max(999_999_999).optional(),
  })
  .refine((page) => (page.width === undefined) === (page.height === undefined), {
    message: "Width and height come together",
  });

export const pagesSchema = z
  .array(pageSchema)
  .min(1)
  .max(LIMITS.pages)
  .refine((pages) => new Set(pages.map((page) => page.id)).size === pages.length, {
    message: "Page ids are unique",
  });

export const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), url: httpUrl }),
  z.object({
    kind: z.literal("pages"),
    origin: z.enum(["image", "pdf"]),
    fileName: text(LIMITS.fileName),
    referenceUrl: httpUrl.optional(),
    pages: pagesSchema,
  }),
]);

export const folderCreateSchema = z.object({
  id: idSchema,
  name: text(LIMITS.folderName),
  parentId: idSchema.nullable().default(null),
  createdAt: time.optional(),
});

export const folderPatchSchema = z
  .object({ name: text(LIMITS.folderName).optional(), parentId: idSchema.nullable().optional() })
  .refine((patch) => patch.name !== undefined || patch.parentId !== undefined, {
    message: "Nothing to change",
  });

export const projectCreateSchema = z.object({
  id: idSchema,
  folderId: idSchema,
  name: text(LIMITS.projectName),
  source: sourceSchema,
  createdAt: time.optional(),
});

export const projectPatchSchema = z
  .object({
    name: text(LIMITS.projectName).optional(),
    folderId: idSchema.optional(),
    source: sourceSchema.optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: "Nothing to change",
  });

export const archiveSchema = z.object({ archived: z.boolean() });

export const labelSchema = z.object({ label: text(LIMITS.label).nullable() });

export const pagesBodySchema = z.object({ pages: pagesSchema });

export const snapshotSchema = z.object({
  id: idSchema,
  width: z.number().int().min(1).max(2560),
  height: z.number().int().min(1).max(16_000),
  createdAt: time,
  blobKey: blobKeySchema,
  sourceUrl: httpUrl,
  scale: z.number().positive().max(1).optional(),
});

const cropSchema = z.object({ blobKey: blobKeySchema, rect });

export const commentCreateSchema = z.object({
  id: idSchema,
  x: percent,
  y: percent,
  body: text(LIMITS.body),
  author: text(LIMITS.author),
  status: z.enum(["active", "resolved"]).default("active"),
  createdAt: time.optional(),
  updatedAt: time.optional(),
  resolvedAt: time.optional(),
  snapshotId: idSchema.optional(),
  pageId: idSchema.optional(),
  crop: cropSchema.optional(),
  /**
   * A guest's comment, pulled from the project's review link: saved without
   * an author account. Only accepted for a comment a guest posted on that link.
   */
  fromShare: z.literal(true).optional(),
});

export const commentPatchSchema = z
  .object({
    body: text(LIMITS.body).optional(),
    status: z.enum(["active", "resolved"]).optional(),
    crop: cropSchema.optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: "Nothing to change",
  });

const reviewWindow = z.enum(REVIEW_WINDOWS);

/**
 * A review link made from the browser (`POST /api/shares`), attached to a
 * workspace project, with the review window its owner chose (left as it is when missing).
 */
export const shareAttachSchema = z.object({
  shareId: idSchema,
  token: secret,
  ownerKey: secret,
  reviewWindow: reviewWindow.optional(),
});

/** A workspace link's settings: how long its clients can comment, from the link's creation. */
export const shareSettingsSchema = z.object({ reviewWindow });

export const shareSyncSchema = z.object({
  cursor: z.number().int().nonnegative(),
  lastSyncedAt: time,
});

/** What the browser sends with a client upload (`clientPayload`), as JSON. */
export const uploadRequestSchema = z.object({
  projectId: idSchema,
  key: blobKeySchema,
  size: z.number().int().positive(),
  contentType: z.enum(BLOB_CONTENT_TYPES),
});

export const blobCommitSchema = z.object({ projectId: idSchema, key: blobKeySchema });

export const authorSchema = z.object({ name: text(LIMITS.author) });

// ── Import ─────────────────────────────────────────────────────────────────

const importShareSchema = z.object({
  id: idSchema,
  token: secret,
  ownerKey: secret,
  createdAt: time,
  cursor: z.number().int().nonnegative(),
  lastSyncedAt: time.optional(),
});

const importFolderSchema = z.object({
  id: idSchema,
  name: text(LIMITS.folderName),
  createdAt: time,
  parentId: idSchema.nullable().default(null),
});

const importProjectSchema = z.object({
  id: idSchema,
  folderId: idSchema,
  name: text(LIMITS.projectName),
  source: sourceSchema,
  createdAt: time,
  updatedAt: time,
  share: importShareSchema.optional(),
});

const importSnapshotSchema = snapshotSchema.extend({ projectId: idSchema });

const importCommentSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  x: percent,
  y: percent,
  body: text(LIMITS.body),
  author: text(LIMITS.author),
  status: z.enum(["active", "resolved"]),
  createdAt: time,
  updatedAt: time,
  resolvedAt: time.optional(),
  snapshotId: idSchema.optional(),
  pageId: idSchema.optional(),
  crop: cropSchema.optional(),
  /** Pulled from a review link (`Comment.fromClient`): imported as a client's. */
  fromClient: z.literal(true).optional(),
});

/** A browser's local data (`SquintData`), as the one-shot import sends it. */
export const importSchema = z.object({
  folders: z.array(importFolderSchema).max(LIMITS.importFolders),
  projects: z.array(importProjectSchema).max(LIMITS.importProjects),
  snapshots: z.array(importSnapshotSchema).max(LIMITS.importSnapshots),
  comments: z.array(importCommentSchema).max(LIMITS.importComments),
  /** The name this browser posts comments under: those comments become the member's own. */
  authorName: text(LIMITS.author).nullable().default(null),
});

export type FolderCreate = z.infer<typeof folderCreateSchema>;
export type FolderPatch = z.infer<typeof folderPatchSchema>;
export type ProjectCreate = z.infer<typeof projectCreateSchema>;
export type ProjectPatch = z.infer<typeof projectPatchSchema>;
export type PageInput = z.infer<typeof pageSchema>;
export type SourceInput = z.infer<typeof sourceSchema>;
export type SnapshotInput = z.infer<typeof snapshotSchema>;
export type CommentCreate = z.infer<typeof commentCreateSchema>;
export type CommentPatch = z.infer<typeof commentPatchSchema>;
export type ShareAttach = z.infer<typeof shareAttachSchema>;
export type ShareSync = z.infer<typeof shareSyncSchema>;
export type ShareSettings = z.infer<typeof shareSettingsSchema>;
export type UploadRequest = z.infer<typeof uploadRequestSchema>;
export type ImportData = z.infer<typeof importSchema>;
export type ImportProject = ImportData["projects"][number];
