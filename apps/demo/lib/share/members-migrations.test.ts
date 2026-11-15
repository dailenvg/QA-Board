import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_040 = MIGRATIONS.slice(0, 40);
const NEW = ["041_membership_permissions", "042_comments_edited_at"];
/** Up to the last of `NEW`: later migrations have their own tests. */
const UP_TO_042 = MIGRATIONS.slice(0, 40 + NEW.length);

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const databases: Array<[string, () => Promise<Database>]> = [
  ["PGlite", () => Promise.resolve(adaptPglite(new PGlite()))],
  ...(TEST_DATABASE_URL
    ? [
        [
          "Postgres",
          async () => {
            const fresh = await freshSchema(TEST_DATABASE_URL as string);
            closers.push(() => fresh.close());
            return fresh.db;
          },
        ] as [string, () => Promise<Database>],
      ]
    : []),
];

/** A database at 040 with a workspace, its owner, a member, and a comment that was edited and resolved. */
async function at040(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_040)).toHaveLength(40);
  const { rows: workspaces } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  const workspaceId = workspaces[0]?.id ?? "";
  const ids: string[] = [];
  for (const [email, role] of [
    ["ana@acme.test", "owner"],
    ["ben@acme.test", "member"],
  ]) {
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'company') RETURNING id",
      [email],
    );
    ids.push(rows[0]?.id ?? "");
    await db.query("INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, $3)", [
      rows[0]?.id,
      workspaceId,
      role,
    ]);
  }
  await db.query(
    `INSERT INTO projects (id, workspace_id, name, source)
     VALUES ('p1', $1, 'P', '{"kind":"url","url":"https://a.test/"}')`,
    [workspaceId],
  );
  await db.query(
    `INSERT INTO comments (project_id, id, x, y, body, author_name, author_user_id, status,
       created_at, updated_at, resolved_at)
     VALUES ('p1', 'c1', 1, 1, 'Hi', 'Ana', $1, 'resolved', now() - interval '1 day', now(), now())`,
    [ids[0]],
  );
  return { db, workspaceId, ownerId: ids[0] ?? "", memberId: ids[1] ?? "" };
}

const PERMISSIONS = "SELECT role, permissions FROM memberships ORDER BY role DESC";

describe.each(databases)("migrations 041 and 042 (%s)", (_name, make) => {
  it("gives every existing membership the default switches, and adds nothing else", async () => {
    const { db } = await at040(make);
    expect(await migrate(db, UP_TO_042)).toEqual(NEW);
    const { rows } = await db.query(PERMISSIONS);
    expect(rows).toEqual([
      { role: "owner", permissions: ["review_links", "trash", "import"] },
      { role: "member", permissions: ["review_links", "trash", "import"] },
    ]);
  });

  it("gives a new member the defaults, and takes any of the four switches", async () => {
    const { db, workspaceId } = await at040(make);
    await migrate(db, UP_TO_042);
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO users (email, password_hash, role) VALUES ('cleo@acme.test', 'x', 'company') RETURNING id",
    );
    const cleo = rows[0]?.id ?? "";
    await db.query(
      "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'member')",
      [cleo, workspaceId],
    );
    await db.query(
      "UPDATE memberships SET permissions = ARRAY['people', 'trash']::text[] WHERE user_id = $1",
      [cleo],
    );
    await db.query("UPDATE memberships SET permissions = '{}' WHERE user_id = $1", [cleo]);
    const { rows: saved } = await db.query(
      "SELECT permissions FROM memberships WHERE user_id = $1",
      [cleo],
    );
    expect(saved).toEqual([{ permissions: [] }]);
  });

  it("refuses a switch it doesn't know, and a missing list", async () => {
    const { db, memberId } = await at040(make);
    await migrate(db, UP_TO_042);
    for (const value of ["ARRAY['admin']::text[]", "ARRAY['trash', 'owner']::text[]", "NULL"]) {
      await expect(
        db.query(`UPDATE memberships SET permissions = ${value} WHERE user_id = $1`, [memberId]),
        value,
      ).rejects.toThrow();
    }
  });

  it("starts every comment unedited, whatever its updated_at says (no backfill)", async () => {
    const { db } = await at040(make);
    await migrate(db, UP_TO_042);
    const { rows } = await db.query<{ edited_at: Date | null; updated_after: boolean }>(
      "SELECT edited_at, updated_at > created_at AS updated_after FROM comments",
    );
    expect(rows).toEqual([{ edited_at: null, updated_after: true }]);
  });

  it("changes nothing when it runs again", async () => {
    const { db, memberId } = await at040(make);
    await migrate(db, UP_TO_042);
    await db.query(
      "UPDATE memberships SET permissions = ARRAY['import']::text[] WHERE user_id = $1",
      [memberId],
    );
    await db.query("UPDATE comments SET edited_at = now()");
    expect(await migrate(db, UP_TO_042)).toEqual([]);
    for (const id of NEW) await db.query(MIGRATIONS.find((m) => m.id === id)?.sql ?? "");
    const { rows } = await db.query("SELECT permissions FROM memberships WHERE user_id = $1", [
      memberId,
    ]);
    expect(rows).toEqual([{ permissions: ["import"] }]);
    const { rows: comments } = await db.query<{ edited: boolean }>(
      "SELECT edited_at IS NOT NULL AS edited FROM comments",
    );
    expect(comments).toEqual([{ edited: true }]);
    await expect(
      db.query("UPDATE memberships SET permissions = ARRAY['admin']::text[] WHERE user_id = $1", [
        memberId,
      ]),
    ).rejects.toThrow();
  });
});
