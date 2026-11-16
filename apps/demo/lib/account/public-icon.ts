import { createHmac, timingSafeEqual } from "node:crypto";
import { authOrigin } from "../auth/auth-url";
import { describeError } from "../auth/http";
import { database } from "../db/database";
import type { EmailEnv } from "../email/resend";
import { publicWorkspaceIconSrc } from "../routes";
import { brandColor, iconVersionOf } from "../share/brand";
import type { Queryable } from "../share/migrate";
import { serverKey } from "../share/server-key";
import { readWorkspaceIcon, WITH_LOGO, type WorkspaceIcon } from "./workspace-logo";

/**
 * A workspace's company icon for anyone signed out, such as an inbox showing
 * a member invite: found by an opaque key, never the workspace's id or slug.
 * The key is an HMAC of the workspace's id, keyed from `AUTH_SECRET`, cut to
 * 22 characters, so it can't be guessed or turned back into the id. Rotating
 * `AUTH_SECRET` changes every key: emails sent before show the name alone.
 */

const KEY_LENGTH = 22;

/** What a key looks like: base64url, `KEY_LENGTH` long. */
export const WORKSPACE_ICON_KEY = /^[A-Za-z0-9_-]{22}$/;

export function workspaceIconKey(
  workspaceId: string,
  secret: string | undefined = process.env.AUTH_SECRET,
): string {
  return createHmac("sha256", serverKey("squint/workspace-icon/v1", secret))
    .update(workspaceId)
    .digest("base64url")
    .slice(0, KEY_LENGTH);
}

function matches(key: string, candidate: string): boolean {
  return timingSafeEqual(Buffer.from(key), Buffer.from(candidate));
}

/**
 * The open workspace whose key is `key`: one HMAC per open workspace (no
 * column holds the key, so nothing needs a migration). Null for a key no
 * workspace has, and for one that's archived or waiting to be deleted (033),
 * as a project link's icon answers. A purged workspace has no row at all.
 */
async function workspaceOfKey(db: Queryable, key: string): Promise<string | null> {
  if (!WORKSPACE_ICON_KEY.test(key)) return null;
  const { rows } = await db.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE archived_at IS NULL AND delete_after IS NULL",
  );
  return rows.find((row) => matches(key, workspaceIconKey(row.id)))?.id ?? null;
}

/** The icon of the open workspace whose key is `key`, or null (unknown, closed: all alike). */
export async function readPublicWorkspaceIcon(
  db: Queryable,
  key: string,
): Promise<WorkspaceIcon | null> {
  const workspaceId = await workspaceOfKey(db, key);
  return workspaceId === null ? null : readWorkspaceIcon(db, workspaceId);
}

/**
 * `readPublicWorkspaceIcon` on this server's database; null without one, and
 * when reading fails (logged by kind only), so the icon answers like an
 * unknown one.
 */
export async function openPublicWorkspaceIcon(key: string): Promise<WorkspaceIcon | null> {
  const pending = database();
  if (!pending) return null;
  try {
    return await readPublicWorkspaceIcon(await pending, key);
  } catch (error) {
    console.error(`squint workspace icon: read failed (${describeError(error)})`);
    return null;
  }
}

interface BrandRow {
  name: string;
  brand_color: string | null;
  logo_key: string | null;
}

/**
 * The workspace's icon as an absolute URL an inbox can load, at its current
 * version; null when the workspace is gone.
 */
export async function workspaceIconUrl(
  db: Queryable,
  workspaceId: string,
  env: EmailEnv = process.env,
): Promise<string | null> {
  const { rows } = await db.query<BrandRow>(
    `SELECT workspace.name, workspace.brand_color, logo.key AS logo_key
     FROM ${WITH_LOGO} WHERE workspace.id = $1`,
    [workspaceId],
  );
  const row = rows[0];
  if (!row) return null;
  const version = iconVersionOf({
    name: row.name,
    color: brandColor(row.brand_color),
    logoKey: row.logo_key,
  });
  const path = publicWorkspaceIconSrc(workspaceIconKey(workspaceId, env.AUTH_SECRET), version);
  return new URL(path, authOrigin(env)).toString();
}
