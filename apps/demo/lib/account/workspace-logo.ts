import { readStoredImage, type BrandLogo } from "../share/brand-logo";
import { logoVersion } from "../share/brand";
import type { Queryable } from "../share/migrate";
import type { BlobDriver } from "../workspace/blob-driver";
import { brandLogoPath } from "../workspace/blob-paths";
import { toLocation } from "../workspace/blobs";
import { done, refuse, type QueryResult } from "../workspace/query-result";
import type { Database } from "../db/database";
import { auditWorkspace } from "./audit";
import type { CheckedImage } from "./image-check";
import { newImageId, storeImage, type ImageDriver, type ImageRow } from "./image-store";

/**
 * A workspace's logo: a `workspace_blobs` row with no project at
 * `ws/<workspaceId>/brand/logo/<id>` (so it counts toward the workspace's
 * storage), named by `workspaces.logo_blob_key`. Read the same way as the
 * guest's (`lib/share/postgres-store.ts`): a key pointing anywhere else is no logo.
 */

/** Who is changing which workspace: the session's user, and the workspace they own. */
export interface WorkspaceActor {
  userId: string;
  workspaceId: string;
}

const LOGO_ROW = `SELECT logo.key, logo.size, logo.bytes, logo.blob_url
  FROM workspaces AS workspace
  JOIN workspace_blobs AS logo
    ON logo.workspace_id = workspace.id AND logo.key = workspace.logo_blob_key
    AND logo.project_id IS NULL
    AND starts_with(logo.key, 'ws/' || workspace.id::text || '/brand/logo/')
  WHERE workspace.id = $1`;

async function currentLogo(db: Queryable, workspaceId: string): Promise<ImageRow | null> {
  const { rows } = await db.query<ImageRow>(LOGO_ROW, [workspaceId]);
  return rows[0] ?? null;
}

/** The logo's `?v=`, or null without one. */
export async function workspaceLogoVersion(
  db: Queryable,
  workspaceId: string,
): Promise<string | null> {
  const logo = await currentLogo(db, workspaceId);
  return logo && logoVersion(logo.key);
}

/** The logo's file, for a member's browser; null without one. */
export async function readWorkspaceLogo(
  db: Queryable,
  workspaceId: string,
  driver?: Pick<BlobDriver, "read">,
): Promise<BrandLogo | null> {
  const logo = await currentLogo(db, workspaceId);
  return logo && readStoredImage({ key: logo.key, location: toLocation(logo) }, driver);
}

/**
 * Makes `image` the workspace's logo, within its storage quota (the old
 * logo's bytes are freed in the same change), and deletes the old one: its
 * row now, its file once that commits. `quota` when it doesn't fit.
 */
export function replaceWorkspaceLogo(
  db: Database,
  driver: ImageDriver,
  { userId, workspaceId }: WorkspaceActor,
  image: CheckedImage,
  now: number,
): Promise<QueryResult<{ version: string }>> {
  const path = brandLogoPath(workspaceId, newImageId());
  return storeImage(driver, path, image, (location, size) =>
    db.transaction(async (tx) => {
      // Locks the usage row as recordBlob does, and the workspace, so two uploads take turns.
      const { rows: usage } = await tx.query<{ bytes: string | number; quota: string | number }>(
        `SELECT usage.bytes, workspace.storage_quota_bytes AS quota
         FROM storage_usage AS usage JOIN workspaces AS workspace ON workspace.id = usage.workspace_id
         WHERE usage.workspace_id = $1 FOR UPDATE OF usage, workspace`,
        [workspaceId],
      );
      const used = usage[0];
      if (!used) return refuse("not-found");
      const old = await currentLogo(tx, workspaceId);
      const freed = old ? Number(old.size) : 0;
      if (Number(used.bytes) - freed + size > Number(used.quota)) return refuse("quota");
      await tx.query(
        `INSERT INTO workspace_blobs (workspace_id, key, project_id, content_type, size, bytes, blob_url)
         VALUES ($1, $2, NULL, $3, $4, $5, $6)`,
        [
          workspaceId,
          path,
          image.contentType,
          size,
          location.kind === "inline" ? location.bytes : null,
          location.kind === "vercel" ? location.url : null,
        ],
      );
      await tx.query("UPDATE workspaces SET logo_blob_key = $2 WHERE id = $1", [workspaceId, path]);
      if (old) await deleteLogoRow(tx, workspaceId, old.key);
      await auditWorkspace(tx, { userId, workspaceId }, "workspace.logo_changed", ["logo"], now);
      return done({ replaced: old && toLocation(old) });
    }),
  );
}

async function deleteLogoRow(tx: Queryable, workspaceId: string, key: string): Promise<void> {
  await tx.query(
    "DELETE FROM workspace_blobs WHERE workspace_id = $1 AND key = $2 AND project_id IS NULL",
    [workspaceId, key],
  );
}

/**
 * Takes the workspace's logo away: its row and pointer now, its file once
 * that commits. False when there was none (nothing changes, nothing is recorded).
 */
export async function removeWorkspaceLogo(
  db: Database,
  driver: Pick<BlobDriver, "discard">,
  { userId, workspaceId }: WorkspaceActor,
  now: number,
): Promise<boolean> {
  const removed = await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ logo_blob_key: string | null }>(
      "SELECT logo_blob_key FROM workspaces WHERE id = $1 FOR UPDATE",
      [workspaceId],
    );
    if (!rows[0]?.logo_blob_key) return null;
    const old = await currentLogo(tx, workspaceId);
    await tx.query("UPDATE workspaces SET logo_blob_key = NULL WHERE id = $1", [workspaceId]);
    if (old) await deleteLogoRow(tx, workspaceId, old.key);
    await auditWorkspace(tx, { userId, workspaceId }, "workspace.logo_removed", ["logo"], now);
    return { location: old && toLocation(old) };
  });
  if (removed?.location) await driver.discard([removed.location]);
  return removed !== null;
}
