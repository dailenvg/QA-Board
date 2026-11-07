import type { Database } from "../db/database";
import { sniffImageType } from "../share/sniff";
import type { ClientUploadDriver, UploadGrant } from "./blob-driver";
import { blobLimit, blobPath } from "./blob-paths";
import { blobRowExists, fitsQuota, recordBlob } from "./blobs";
import { BLOB_CONTENT_TYPES, UPLOAD_TOKEN_MS } from "./limits";
import { isLiveProject } from "./projects";
import type { UploadRequest } from "./schemas";
import { done, refuse, type QueryResult } from "./query-result";

/**
 * How a file gets into a workspace. With Vercel Blob: the browser asks for a
 * token (`uploadGrant`), uploads straight to the store, then commits
 * (`commitUpload`), which checks the file really is there and records it; the
 * store's completion callback commits too, as a backup, so whichever comes
 * second finds the row and changes nothing. Without Vercel Blob (local only):
 * the bytes come through the app (`storeInline`).
 */

export interface Committed {
  key: string;
  /** False when the file was already recorded (a retry, or the callback got there first). */
  created: boolean;
}

/** What a client upload token may do, or why there's none: checked before it's issued. */
export async function uploadGrant(
  db: Database,
  workspaceId: string,
  upload: UploadRequest,
  now: number,
): Promise<QueryResult<UploadGrant>> {
  if (!(await isLiveProject(db, workspaceId, upload.projectId))) return refuse("not-found");
  const pathname = blobPath(workspaceId, upload.projectId, upload.key);
  if (await blobRowExists(db, workspaceId, pathname)) return refuse("exists");
  if (upload.size > blobLimit(upload.key)) return refuse("too-large");
  if (!(await fitsQuota(db, workspaceId, upload.size))) return refuse("quota");
  return done({
    pathname,
    contentType: upload.contentType,
    maximumSizeInBytes: upload.size,
    validUntil: now + UPLOAD_TOKEN_MS,
    tokenPayload: JSON.stringify({ workspaceId, projectId: upload.projectId, key: upload.key }),
  });
}

const isAllowedType = (type: string) => (BLOB_CONTENT_TYPES as readonly string[]).includes(type);

/**
 * Records a file the browser uploaded to Vercel Blob. Refuses (and deletes)
 * one that's too big, of a type the token shouldn't have allowed, or over the
 * quota. Never touches a file that's already recorded.
 */
export async function commitUpload(
  db: Database,
  driver: ClientUploadDriver,
  workspaceId: string,
  { projectId, key }: { projectId: string; key: string },
): Promise<QueryResult<Committed>> {
  if (!(await isLiveProject(db, workspaceId, projectId))) return refuse("not-found");
  const pathname = blobPath(workspaceId, projectId, key);
  if (await blobRowExists(db, workspaceId, pathname)) {
    return done({ key, created: false });
  }
  const file = await driver.head(pathname);
  if (!file) return refuse("not-uploaded");
  const discard = () => driver.discard([{ kind: "vercel", url: file.url }]);
  if (file.size > blobLimit(key)) {
    await discard();
    return refuse("too-large");
  }
  if (!isAllowedType(file.contentType)) {
    await discard();
    return refuse("wrong-kind");
  }
  const recorded = await db.transaction((tx) =>
    recordBlob(tx, workspaceId, {
      projectId,
      key,
      contentType: file.contentType,
      size: file.size,
      location: { kind: "vercel", url: file.url },
    }),
  );
  if (!recorded.ok) {
    // Trashed meanwhile: the file stays for the cron's sweep (it has no row).
    if (recorded.reason === "quota") await discard();
    return recorded;
  }
  return done({ key, created: recorded.value === "created" });
}

/** Stores a file's bytes in its row (local development and e2e only). */
export async function storeInline(
  db: Database,
  workspaceId: string,
  { projectId, key }: { projectId: string; key: string },
  bytes: Uint8Array,
): Promise<QueryResult<Committed>> {
  if (bytes.length === 0 || bytes.length > blobLimit(key)) return refuse("too-large");
  const contentType = sniffImageType(bytes);
  if (!contentType) return refuse("wrong-kind");
  const recorded = await db.transaction((tx) =>
    recordBlob(tx, workspaceId, {
      projectId,
      key,
      contentType,
      size: bytes.length,
      location: { kind: "inline", bytes },
    }),
  );
  return recorded.ok ? done({ key, created: recorded.value === "created" }) : recorded;
}
