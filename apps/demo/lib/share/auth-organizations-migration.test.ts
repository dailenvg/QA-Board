import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { PASSWORD } from "@/test/accounts-fixture";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import { hashPassword } from "../auth/password";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_049 = MIGRATIONS.slice(0, 49);
const UP_TO_050 = MIGRATIONS.slice(0, 50);
const AUTH_ORGANIZATIONS = MIGRATIONS.find(({ id }) => id === "050_auth_organizations");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

/** A user owning a workspace, with a session, as the code before 050 writes them. */
async function legacyOwner(db: Database): Promise<{ userId: string; workspaceId: string }> {
  const { rows: users } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ('ana@acme.test', $1, 'company') RETURNING id",
    [await hashPassword(PASSWORD)],
  );
  const { rows: workspaces } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  const userId = users[0]?.id ?? "";
  const workspaceId = workspaces[0]?.id ?? "";
  await db.query("INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'owner')", [
    userId,
    workspaceId,
  ]);
  await db.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')",
    ["a".repeat(64), userId],
  );
  return { userId, workspaceId };
}

describe.each(databases)("050_auth_organizations on %s", (_name, make) => {
  it("gives each membership an id, adds two empty columns, and changes nothing the second time", async () => {
    const db = await make();
    expect(await migrate(db, UP_TO_049)).toHaveLength(49);
    expect(UP_TO_049.at(-1)?.id).toBe("049_auth_verifications");
    await legacyOwner(db);
    expect(await migrate(db, UP_TO_050)).toEqual(["050_auth_organizations"]);
    const { rows: before } = await db.query<{ id: string }>("SELECT id FROM memberships");
    expect(before).toEqual([{ id: expect.stringMatching(UUID) as unknown }]);
    await db.query(AUTH_ORGANIZATIONS?.sql ?? "");
    const { rows: after } = await db.query<{ id: string }>("SELECT id FROM memberships");
    expect(after).toEqual(before);
    const { rows: sessions } = await db.query("SELECT active_organization_id FROM sessions");
    expect(sessions).toEqual([{ active_organization_id: null }]);
    const { rows: workspaces } = await db.query("SELECT metadata FROM workspaces");
    expect(workspaces).toEqual([{ metadata: null }]);
  });

  it("still takes memberships the old way, each with an id of its own", async () => {
    const db = await make();
    await migrate(db);
    const { userId, workspaceId } = await legacyOwner(db);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role) VALUES ('bo@acme.test', 'hash', 'company')
       RETURNING id`,
    );
    await db.query(
      "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'member')",
      [rows[0]?.id, workspaceId],
    );
    const { rows: ids } = await db.query<{ count: string }>(
      "SELECT count(DISTINCT id)::text AS count FROM memberships",
    );
    expect(ids).toEqual([{ count: "2" }]);
    await expect(
      db.query(
        "UPDATE memberships SET id = (SELECT id FROM memberships WHERE user_id = $1) WHERE user_id <> $1",
        [userId],
      ),
    ).rejects.toThrow();
  });
});
