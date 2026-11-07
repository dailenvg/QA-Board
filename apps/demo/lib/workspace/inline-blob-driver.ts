import { LoggableError } from "../auth/http";
import type { BlobDriver } from "./blob-driver";

/**
 * Files kept in their `workspace_blobs` row (`bytes`), uploaded through the
 * app's own route. For local development and the e2e server only: on Vercel
 * every request body stops at 4.5 MB and Postgres would carry every image, so
 * it refuses to run there (`VERCEL` is set on every Vercel build and function).
 */
export function inlineBlobDriver(env: Readonly<Record<string, string | undefined>>): BlobDriver & {
  readonly kind: "inline";
} {
  if (env.VERCEL) throw new LoggableError("BLOB_READ_WRITE_TOKEN is not set on Vercel");
  return {
    kind: "inline",
    read: (location) => Promise.resolve(location.kind === "inline" ? location.bytes : null),
    // The bytes go with their row.
    discard: () => Promise.resolve(),
  };
}
