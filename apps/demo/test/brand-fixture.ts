import type { Queryable } from "@/lib/share/migrate";
import { brandLogoPath } from "@/lib/workspace/blob-paths";

/**
 * A workspace's logo, as the settings page will store it (PR D): a
 * `workspace_blobs` row with no project, its bytes inline, and the
 * workspace's `logo_blob_key` pointing at it. Returns the key.
 */
export async function seedLogo(
  db: Queryable,
  workspaceId: string,
  bytes: Uint8Array,
  { id = "logo-1", contentType = "image/png" }: { id?: string; contentType?: string } = {},
): Promise<string> {
  const key = brandLogoPath(workspaceId, id);
  await db.query(
    `INSERT INTO workspace_blobs (workspace_id, key, project_id, content_type, size, bytes)
     VALUES ($1, $2, NULL, $3, $4, $5)`,
    [workspaceId, key, contentType, bytes.length, bytes],
  );
  await db.query("UPDATE workspaces SET logo_blob_key = $2 WHERE id = $1", [workspaceId, key]);
  return key;
}

export async function setBrand(
  db: Queryable,
  workspaceId: string,
  brand: { name?: string; color?: string | null },
): Promise<void> {
  await db.query(
    `UPDATE workspaces SET name = COALESCE($2, name), brand_color = $3 WHERE id = $1`,
    [workspaceId, brand.name ?? null, brand.color ?? null],
  );
}
