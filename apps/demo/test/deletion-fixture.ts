import { scheduleAccountDeletion } from "@/lib/account/account-deletion";
import { createSession } from "@/lib/auth/sessions";
import type { SessionUser } from "@/lib/auth/users";
import type { Database } from "@/lib/db/database";
import { inlineBackend } from "@/lib/share/blob-backend";
import type { Queryable } from "@/lib/share/migrate";
import { createPostgresStore } from "@/lib/share/postgres-store";
import { createShare, type CreatedShare } from "@/lib/share/service";
import { createProject } from "@/lib/workspace/projects";
import { attachShare } from "@/lib/workspace/share-links";
import { storeInline } from "@/lib/workspace/uploads";
import { insertUser, PASSWORD } from "./accounts-fixture";
import { migratedPglite } from "./pglite";
import { seedLogo } from "./brand-fixture";
import { STATE } from "./share-fixture";
import {
  addFolder,
  NOW,
  PNG,
  seat,
  TEST_AUTH_SECRET,
  URL_PROJECT,
  type Seat,
} from "./workspace-fixture";

/**
 * A workspace with everything deleting an account touches: an owner who can
 * sign in (`PASSWORD`), a project with a file, a comment and a review link,
 * a share file, a logo and the owner's avatar; and a second workspace that
 * must never change.
 */
export interface DeletionWorld {
  db: Database;
  owner: SessionUser;
  /** The owner's browser's `Cookie` header. */
  cookie: string;
  workspaceId: string;
  share: CreatedShare;
  other: Seat;
}

export const OWNER_EMAIL = "ana@acme.test";
export const WORKSPACE_NAME = "Acme Studio";

/** Avatar and share file URLs, as Vercel Blob would hold them, so a purge's discards can be seen. */
export const AVATAR_URL = "https://blob.test/user/avatar";
export const SHARE_FILE_URL = "https://blob.test/squint/share-file";

async function addAvatar(db: Queryable, userId: string) {
  const key = `user/${userId}/avatar/a1`;
  await db.query(
    `INSERT INTO user_blobs (user_id, key, content_type, size, blob_url)
     VALUES ($1, $2, 'image/png', 12, $3)`,
    [userId, key, AVATAR_URL],
  );
  await db.query("UPDATE users SET avatar_blob_key = $2 WHERE id = $1", [userId, key]);
}

async function addShare(db: Database, workspaceId: string): Promise<CreatedShare> {
  const store = createPostgresStore(db);
  const share = await createShare({ store, blobs: inlineBackend }, STATE, NOW);
  await db.transaction((tx) =>
    attachShare(
      tx,
      workspaceId,
      "p1",
      { shareId: share.shareId, token: share.token, ownerKey: share.ownerKey },
      NOW,
      TEST_AUTH_SECRET,
    ),
  );
  await store.putBlob(share.shareId, {
    key: "page:x",
    contentType: "image/png",
    size: 12,
    location: { kind: "vercel", url: SHARE_FILE_URL },
  });
  return share;
}

/** A member of `workspaceId` who can sign in, and their id. */
export async function addMember(db: Queryable, workspaceId: string, email: string) {
  const id = await insertUser(db, email);
  await db.query(
    "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'member')",
    [id, workspaceId],
  );
  return id;
}

export const MEMBER_EMAIL = "bo@acme.test";
const IP = "203.0.113.9";

/**
 * A member of the world's workspace who deleted their account, and then its
 * owner, so the workspace is waiting to be deleted too: restoring the member
 * doesn't reopen it. Both deleted at `now`. Returns the member.
 */
export async function closingMember(world: DeletionWorld, now: number): Promise<SessionUser> {
  const { db, owner, workspaceId } = world;
  const id = await addMember(db, workspaceId, MEMBER_EMAIL);
  const member: SessionUser = { id, email: MEMBER_EMAIL, name: null, role: "company" };
  const request = (confirmText: string) => ({ confirmText, currentPassword: PASSWORD, ip: IP });
  for (const [user, confirmText] of [
    [member, MEMBER_EMAIL],
    [owner, WORKSPACE_NAME],
  ] as const) {
    const result = await scheduleAccountDeletion(db, user, request(confirmText), now);
    if (!result.ok) throw new Error(`not deleted: ${JSON.stringify(result)}`);
  }
  return member;
}

export async function deletionWorld(): Promise<DeletionWorld> {
  const db = await migratedPglite();
  const ownerId = await insertUser(db, OWNER_EMAIL);
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', $1) RETURNING id",
    [WORKSPACE_NAME],
  );
  const workspaceId = rows[0]?.id ?? "";
  await db.query("INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'owner')", [
    ownerId,
    workspaceId,
  ]);
  await addFolder(db, workspaceId);
  await createProject(db, workspaceId, URL_PROJECT("p1"), NOW);
  await storeInline(db, workspaceId, { projectId: "p1", key: "crop:c1" }, PNG);
  await seedLogo(db, workspaceId, PNG);
  await addAvatar(db, ownerId);
  const share = await addShare(db, workspaceId);
  const token = await createSession(db, ownerId, Date.now());
  return {
    db,
    owner: { id: ownerId, email: OWNER_EMAIL, name: null, role: "company" },
    cookie: `squint_session=${token}`,
    workspaceId,
    share,
    other: await seat(db, "bravo"),
  };
}

/** How many rows `table` has for `column = value`. */
export async function countRows(
  db: Queryable,
  table: string,
  column: string,
  value: string,
): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${table} WHERE ${column} = $1`,
    [value],
  );
  return rows[0]?.count ?? 0;
}
