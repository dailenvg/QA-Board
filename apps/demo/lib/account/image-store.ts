import { randomBytes } from "node:crypto";
import { logoVersion } from "../share/brand";
import type { BlobLocation } from "../share/types";
import type { BlobDriver, BlobWriter } from "../workspace/blob-driver";
import { done, type QueryResult } from "../workspace/query-result";
import type { CheckedImage } from "./image-check";

/** What storing a logo or an avatar needs of the blob driver. */
export type ImageDriver = Pick<BlobDriver, "discard"> & BlobWriter;

/** What a stored image's row replaced: the old file, for deleting once the change commits. */
export interface Replaced {
  replaced: BlobLocation | null;
}

/** A new file's id in its path: 16 URL-safe characters, so each upload gets a fresh `?v=`. */
export function newImageId(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * Stores a checked image at `path`, then runs `record` (one transaction:
 * the new row, the pointer to it, the old row gone). If `record` refuses or
 * throws, the new file is deleted; once it commits, the file it replaced is.
 * Answers the new image's version, for its `?v=`.
 */
export async function storeImage(
  driver: ImageDriver,
  path: string,
  image: CheckedImage,
  record: (location: BlobLocation, size: number) => Promise<QueryResult<Replaced>>,
): Promise<QueryResult<{ version: string }>> {
  const location = await driver.put(path, image.bytes, image.contentType);
  let recorded: QueryResult<Replaced>;
  try {
    recorded = await record(location, image.bytes.length);
  } catch (error) {
    await driver.discard([location]);
    throw error;
  }
  if (!recorded.ok) {
    await driver.discard([location]);
    return recorded;
  }
  if (recorded.value.replaced) await driver.discard([recorded.value.replaced]);
  return done({ version: logoVersion(path) });
}

/** A file row's location columns, for `toLocation`. */
export interface ImageRow {
  key: string;
  size: string | number;
  bytes: Uint8Array | null;
  blob_url: string | null;
}
