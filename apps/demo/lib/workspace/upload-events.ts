import { z } from "zod";
import { blobKeySchema, idSchema } from "./schemas";

/**
 * The two requests `@vercel/blob/client` and the store send to the upload
 * route (`HandleUploadBody`), checked before the SDK sees them.
 */
export const handleUploadBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("blob.generate-client-token"),
    payload: z.object({
      pathname: z.string().max(512),
      clientPayload: z.string().max(2048).nullable(),
      multipart: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal("blob.upload-completed"),
    payload: z.looseObject({
      blob: z.looseObject({ pathname: z.string(), url: z.string() }),
      tokenPayload: z.string().max(2048).nullish(),
    }),
  }),
]);

/** What `uploadGrant` signs into a token: the upload it allows. */
export const tokenPayloadSchema = z.object({
  workspaceId: z.uuid(),
  projectId: idSchema,
  key: blobKeySchema,
});

/** `value` parsed as JSON, or undefined (which no schema accepts). */
export function parseJson(value: string | null | undefined): unknown {
  try {
    return value ? (JSON.parse(value) as unknown) : undefined;
  } catch {
    return undefined;
  }
}
