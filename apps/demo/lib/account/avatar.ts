import { readStoredImage, type BrandLogo } from "../share/brand-logo";
import { logoVersion } from "../share/brand";
import type { Queryable } from "../share/migrate";
import type { BlobDriver } from "../workspace/blob-driver";
import { toLocation } from "../workspace/blobs";
import { done, refuse, type QueryResult } from "../workspace/query-result";
import type { Database } from "../db/database";
import { auditAccount } from "./audit";
import type { CheckedImage } from "./image-check";
import { newImageId, storeImage, type ImageDriver, type ImageRow } from "./image-store";

/**
 * A user's avatar: a `user_blobs` row (029) at `user/<userId>/avatar/<id>`,
 * named by `users.avatar_blob_key`. Like a workspace's logo, a key pointing
 * anywhere but the user's own avatar path is no avatar.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Every user's file sits under this prefix: outside `ws/` and `squint/`. */
export const USER_BLOB_PREFIX = "user/";

/** Where a user's avatar is stored. */
export function avatarPath(userId: string, id: string): string {
  if (!UUID.test(userId) || !ID.test(id)) throw new Error("Not an avatar path.");
  return `${USER_BLOB_PREFIX}${userId}/avatar/${id}`;
}

const AVATAR_PATH =
  /^user\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/avatar\/[A-Za-z0-9_-]{1,64}$/;

/** The user an avatar's path belongs to; null for anything else. */
export function parseAvatarPath(path: string): { userId: string } | null {
  const userId = AVATAR_PATH.exec(path)?.[1];
  return userId ? { userId } : null;
}

/** Whether a row records the file at `path` (the cron's sweep keeps those). */
export async function avatarRowExists(db: Queryable, userId: string, path: string) {
  const { rows } = await db.query("SELECT 1 FROM user_blobs WHERE user_id = $1 AND key = $2", [
    userId,
    path,
  ]);
  return rows.length === 1;
}

const AVATAR_ROW = `SELECT avatar.key, avatar.size, avatar.bytes, avatar.blob_url
  FROM users AS account
  JOIN user_blobs AS avatar
    ON avatar.user_id = account.id AND avatar.key = account.avatar_blob_key
    AND starts_with(avatar.key, 'user/' || account.id::text || '/avatar/')
  WHERE account.id = $1 AND account.deleted_at IS NULL`;

async function currentAvatar(db: Queryable, userId: string): Promise<ImageRow | null> {
  const { rows } = await db.query<ImageRow>(AVATAR_ROW, [userId]);
  return rows[0] ?? null;
}

/** The avatar's `?v=`, or null without one. */
export async function avatarVersion(db: Queryable, userId: string): Promise<string | null> {
  const avatar = await currentAvatar(db, userId);
  return avatar && logoVersion(avatar.key);
}

/** The avatar's file, for its own user's browser; null without one. */
export async function readAvatar(
  db: Queryable,
  userId: string,
  driver?: Pick<BlobDriver, "read">,
): Promise<BrandLogo | null> {
  const avatar = await currentAvatar(db, userId);
  return avatar && readStoredImage({ key: avatar.key, location: toLocation(avatar) }, driver);
}

async function deleteAvatarRow(tx: Queryable, userId: string, key: string): Promise<void> {
  await tx.query("DELETE FROM user_blobs WHERE user_id = $1 AND key = $2", [userId, key]);
}

/**
 * Makes `image` the user's avatar and deletes the old one: its row now, its
 * file once that commits. `not-found` for a deleted user.
 */
export function replaceAvatar(
  db: Database,
  driver: ImageDriver,
  userId: string,
  image: CheckedImage,
  now: number,
): Promise<QueryResult<{ version: string }>> {
  const path = avatarPath(userId, newImageId());
  return storeImage(driver, path, image, (location, size) =>
    db.transaction(async (tx) => {
      // Locks the user, so two uploads take turns.
      const { rows } = await tx.query(
        "SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [userId],
      );
      if (rows.length === 0) return refuse("not-found");
      const old = await currentAvatar(tx, userId);
      await tx.query(
        `INSERT INTO user_blobs (user_id, key, content_type, size, bytes, blob_url)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          path,
          image.contentType,
          size,
          location.kind === "inline" ? location.bytes : null,
          location.kind === "vercel" ? location.url : null,
        ],
      );
      await tx.query("UPDATE users SET avatar_blob_key = $2 WHERE id = $1", [userId, path]);
      if (old) await deleteAvatarRow(tx, userId, old.key);
      await auditAccount(tx, userId, "user.avatar_changed", ["avatar"], now);
      return done({ replaced: old && toLocation(old) });
    }),
  );
}

/**
 * Takes the user's avatar away: its row and pointer now, its file once that
 * commits. False when there was none (nothing changes, nothing is recorded).
 */
export async function removeAvatar(
  db: Database,
  driver: Pick<BlobDriver, "discard">,
  userId: string,
  now: number,
): Promise<boolean> {
  const removed = await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ avatar_blob_key: string | null }>(
      "SELECT avatar_blob_key FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
      [userId],
    );
    if (!rows[0]?.avatar_blob_key) return null;
    const old = await currentAvatar(tx, userId);
    await tx.query("UPDATE users SET avatar_blob_key = NULL WHERE id = $1", [userId]);
    if (old) await deleteAvatarRow(tx, userId, old.key);
    await auditAccount(tx, userId, "user.avatar_removed", ["avatar"], now);
    return { location: old && toLocation(old) };
  });
  if (removed?.location) await driver.discard([removed.location]);
  return removed !== null;
}
