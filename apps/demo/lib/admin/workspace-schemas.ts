import { z } from "zod";
import { MAX_QUOTA_BYTES, MIN_QUOTA_BYTES } from "./quota";

/** What the admin panel's workspace routes accept. */

/** A workspace's id in a route: a UUID, as Postgres makes them. */
export const workspaceIdSchema = z.uuid();

/** `PUT …/quota`: the new quota in bytes, within the panel's bounds. */
export const quotaSchema = z
  .object({ quotaBytes: z.number().int().min(MIN_QUOTA_BYTES).max(MAX_QUOTA_BYTES) })
  .strict();

/** The other actions take nothing but the workspace in their path: an empty JSON object. */
export const noFieldsSchema = z.object({}).strict();
