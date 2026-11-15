import { createHmac, timingSafeEqual } from "node:crypto";
import { readStoredImage, type BrandLogo } from "../../share/brand-logo";
import type { Queryable } from "../../share/migrate";
import { serverKey } from "../../share/server-key";
import type { BlobDriver } from "../blob-driver";
import { toLocation } from "../blobs";

/**
 * A member's opaque key in one workspace (4.11), so the browser can ask for
 * their avatar without ever holding a user id: an HMAC of the workspace and
 * the user, keyed from `AUTH_SECRET`, cut to 22 characters. The same person
 * has another key in any other workspace. Rotating `AUTH_SECRET` changes
 * every key, so avatars just load again.
 */

const KEY_LENGTH = 22;

/** What a key looks like: base64url, `KEY_LENGTH` long. */
export const PERSON_KEY = /^[A-Za-z0-9_-]{22}$/;

export function personKey(
  workspaceId: string,
  userId: string,
  secret: string | undefined = process.env.AUTH_SECRET,
): string {
  return createHmac("sha256", serverKey("squint/person/v1", secret))
    .update(`${workspaceId}:${userId}`)
    .digest("base64url")
    .slice(0, KEY_LENGTH);
}

function matches(key: string, candidate: string): boolean {
  return timingSafeEqual(Buffer.from(key), Buffer.from(candidate));
}

interface AvatarRow {
  user_id: string;
  key: string;
  bytes: Uint8Array | null;
  blob_url: string | null;
}

/**
 * The avatar of the active member of `workspaceId` whose key is `key`: one
 * HMAC per member (a few at most). Null for a key no member has, for a
 * member who's removed or deleted their account, and without an avatar.
 */
export async function readPersonAvatar(
  db: Queryable,
  workspaceId: string,
  key: string,
  driver?: Pick<BlobDriver, "read">,
): Promise<BrandLogo | null> {
  if (!PERSON_KEY.test(key)) return null;
  const { rows } = await db.query<AvatarRow>(
    `SELECT u.id AS user_id, avatar.key, avatar.bytes, avatar.blob_url
     FROM memberships AS m
     JOIN users AS u ON u.id = m.user_id AND u.deleted_at IS NULL
     JOIN user_blobs AS avatar
       ON avatar.user_id = u.id AND avatar.key = u.avatar_blob_key
       AND starts_with(avatar.key, 'user/' || u.id::text || '/avatar/')
     WHERE m.workspace_id = $1`,
    [workspaceId],
  );
  const row = rows.find((entry) => matches(key, personKey(workspaceId, entry.user_id)));
  return row ? readStoredImage({ key: row.key, location: toLocation(row) }, driver) : null;
}
