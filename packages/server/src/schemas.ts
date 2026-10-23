import { z } from "zod";
import { MAX_BODY_LENGTH, MAX_NAME_LENGTH, MAX_SCREENSHOT_BYTES, PRIORITIES } from "./types";

/**
 * Loose bound only: the decoded size is enforced after parsing so oversized
 * images get a 413 instead of a generic 400.
 */
const MAX_SCREENSHOT_CHARS = MAX_SCREENSHOT_BYTES * 2;
const MAX_URL_LENGTH = 4096;

const percent = z.number().finite().min(0).max(100);
const dimension = z.number().int().min(0).max(100_000);
const isoDate = z.iso.datetime({ offset: true });

export const pathSchema = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^\/[^\s]*$/, "Path must start with / and contain no whitespace");

export const nameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);
export const bodySchema = z.string().trim().min(1).max(MAX_BODY_LENGTH);
export const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\w-]+$/, "Invalid id");

export const anchorSchema = z.object({
  selector: z.string().min(1).max(4000),
  xPct: percent,
  yPct: percent,
  viewportXPct: percent,
  viewportYPct: percent,
});

export const contextSchema = z.object({
  viewport: z.object({ width: dimension, height: dimension }),
  userAgent: z.string().max(512),
});

export const prioritySchema = z.enum(PRIORITIES).nullable();

export const createPinInputSchema = z.object({
  path: pathSchema,
  pageUrl: z.url({ protocol: /^https?$/ }).max(MAX_URL_LENGTH),
  anchor: anchorSchema,
  author: nameSchema,
  body: bodySchema,
  priority: prioritySchema,
  screenshot: z.string().max(MAX_SCREENSHOT_CHARS).nullable(),
  context: contextSchema,
});

export const updatePinRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), pinId: idSchema, author: nameSchema, body: bodySchema }),
  z.object({ action: z.literal("resolve"), pinId: idSchema, author: nameSchema }),
]);

export const replySchema = z.object({
  id: idSchema,
  author: z.string().max(MAX_NAME_LENGTH),
  body: z.string().max(MAX_BODY_LENGTH),
  createdAt: isoDate,
});

/** Full stored pin, used to validate records read back from storage. */
export const pinSchema = z.object({
  id: idSchema,
  path: pathSchema,
  branch: z.string().max(255).nullable(),
  deploymentUrl: z.string().max(MAX_URL_LENGTH),
  deepLink: z.string().max(MAX_URL_LENGTH),
  anchor: anchorSchema,
  author: z.string().max(MAX_NAME_LENGTH),
  body: z.string().max(MAX_BODY_LENGTH),
  priority: prioritySchema,
  screenshotUrl: z.string().max(MAX_URL_LENGTH).nullable(),
  context: contextSchema,
  replies: z.array(replySchema),
  resolved: z.boolean(),
  resolvedAt: isoDate.nullable(),
  resolvedBy: z.string().max(MAX_NAME_LENGTH).nullable(),
  createdAt: isoDate,
});
