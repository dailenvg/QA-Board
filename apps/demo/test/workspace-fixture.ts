import { DEFAULT_SWITCHES, type MemberSwitch } from "@/lib/auth/permissions";
import type { Database } from "@/lib/db/database";
import type { Queryable } from "@/lib/share/migrate";
import type { ProjectCreate } from "@/lib/workspace/schemas";
import { insertSession } from "@/test/sessions-fixture";
import { migratedPglite } from "./pglite";

/** 2026-11-02T12:00:00Z: real epoch ms, as `Date.now()` gives. */
export const NOW = Date.UTC(2026, 10, 2, 12);

/** A secret for sealing share links in tests (never a real AUTH_SECRET). */
export const TEST_AUTH_SECRET = "test-auth-secret-0123456789abcdef";

export interface Seat {
  workspaceId: string;
  userId: string;
  /** The `Cookie` header of a signed-in browser of this workspace's owner. */
  cookie: string;
}

let seats = 0;

/** A workspace with an owner who has a session. The password hash is a placeholder: nobody logs in. */
export async function seat(db: Queryable, slug: string): Promise<Seat> {
  seats += 1;
  const { rows: workspace } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ($1, $1) RETURNING id",
    [slug],
  );
  const { rows: user } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'company') RETURNING id",
    [`owner-${seats}@${slug}.test`],
  );
  const workspaceId = workspace[0]?.id ?? "";
  const userId = user[0]?.id ?? "";
  await db.query("INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'owner')", [
    userId,
    workspaceId,
  ]);
  const token = await insertSession(db, userId, Date.now());
  return { workspaceId, userId, cookie: `squint_session=${token}` };
}

let members = 0;

/**
 * A member (not the owner) of `workspaceId`, signed in, with `permissions` as
 * their switches (041's defaults when left out).
 */
export async function memberSeat(
  db: Queryable,
  workspaceId: string,
  permissions: readonly MemberSwitch[] = DEFAULT_SWITCHES,
  name: string | null = null,
): Promise<Seat> {
  members += 1;
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role, name) VALUES ($1, 'x', 'company', $2) RETURNING id",
    [`member-${members}@members.test`, name],
  );
  const userId = rows[0]?.id ?? "";
  await db.query(
    `INSERT INTO memberships (user_id, workspace_id, role, permissions)
     VALUES ($1, $2, 'member', $3::text[])`,
    [userId, workspaceId, [...permissions]],
  );
  const token = await insertSession(db, userId, Date.now());
  return { workspaceId, userId, cookie: `squint_session=${token}` };
}

/** `seat` as an importer who may also attach review links (the owner). */
export const importer = (seat: Pick<Seat, "userId">) => ({
  userId: seat.userId,
  canAttachShares: true,
});

/** A fresh database with two workspaces, A and B, each with its owner signed in. */
export async function twoWorkspaces(): Promise<{ db: Database; a: Seat; b: Seat }> {
  const db = await migratedPglite();
  return { db, a: await seat(db, "acme"), b: await seat(db, "bravo") };
}

export async function addFolder(db: Queryable, workspaceId: string, id = "f1", parentId?: string) {
  await db.query(
    "INSERT INTO folders (workspace_id, id, parent_id, name) VALUES ($1, $2, $3, $2)",
    [workspaceId, id, parentId ?? null],
  );
}

export const URL_PROJECT = (id: string, folderId = "f1"): ProjectCreate => ({
  id,
  folderId,
  name: `Project ${id}`,
  source: { kind: "url", url: "https://acme.example/" },
});

export const PAGES_PROJECT = (id: string, folderId = "f1"): ProjectCreate => ({
  id,
  folderId,
  name: `Pages ${id}`,
  source: {
    kind: "pages",
    origin: "image",
    fileName: "home.png",
    pages: [
      { id: "page-1", blobKey: "page:page-1", name: "Home", width: 1440, height: 3000 },
      { id: "page-2", blobKey: "page:page-2", name: "About" },
    ],
  },
});

/** The smallest valid PNG header, padded: enough for type sniffing. */
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
