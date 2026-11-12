import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

/** Every migration before 034: the schema production had when account deletion shipped. */
const UP_TO_033 = MIGRATIONS.slice(0, 33);
const NEW = ["034_squint_shares_inviter_backfill", "035_squint_shares_review_window"];
/** Up to the last of `NEW`: later migrations have their own tests. */
const UP_TO_035 = MIGRATIONS.slice(0, 33 + NEW.length);

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

const PROJECT = JSON.stringify({ name: "P", source: { kind: "url", url: "https://a.test/" } });

/** Inserts a share row as 033 knew it: in a workspace's project, or anonymous (expiring). */
async function insertShare(
  db: Database,
  id: string,
  place: { workspaceId: string; projectId: string } | null,
  invitedBy: string | null = null,
) {
  await db.query(
    `INSERT INTO squint_shares (id, token_hash, owner_key_hash, project, created_at, updated_at,
       expires_at, workspace_id, project_id, invited_by_user_id)
     VALUES ($1, $1 || '-token', $1 || '-owner', $2::jsonb, 1, 1, $3, $4, $5, $6)`,
    [
      id,
      PROJECT,
      place ? null : 10_000,
      place?.workspaceId ?? null,
      place?.projectId ?? null,
      invitedBy,
    ],
  );
}

/**
 * A database at 033: workspace Acme (owner Ana, member Ben) with three links,
 * one already credited to Ben, and an anonymous share.
 */
async function at033(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_033)).toHaveLength(33);
  const user = async (email: string) => {
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'company') RETURNING id",
      [email],
    );
    return rows[0]?.id ?? "";
  };
  const ana = await user("ana@acme.test");
  const ben = await user("ben@acme.test");
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  const workspaceId = rows[0]?.id ?? "";
  await db.query(
    `INSERT INTO memberships (user_id, workspace_id, role)
     VALUES ($1, $3, 'owner'), ($2, $3, 'member')`,
    [ana, ben, workspaceId],
  );
  for (const projectId of ["p1", "p2", "p3"]) {
    await db.query(
      `INSERT INTO projects (id, workspace_id, name, source)
       VALUES ($1, $2, 'P', '{"kind":"url","url":"https://a.test/"}')`,
      [projectId, workspaceId],
    );
  }
  await insertShare(db, "linked-1", { workspaceId, projectId: "p1" });
  await insertShare(db, "linked-2", { workspaceId, projectId: "p2" });
  await insertShare(db, "by-ben", { workspaceId, projectId: "p3" }, ben);
  await insertShare(db, "anonymous", null);
  return { db, ana, ben, workspaceId };
}

async function inviters(db: Database): Promise<Record<string, string | null>> {
  const { rows } = await db.query<{ id: string; invited_by_user_id: string | null }>(
    "SELECT id, invited_by_user_id FROM squint_shares ORDER BY id",
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.invited_by_user_id]));
}

async function windows(db: Database): Promise<Record<string, number | null>> {
  const { rows } = await db.query<{ id: string; review_window_hours: number | null }>(
    "SELECT id, review_window_hours FROM squint_shares ORDER BY id",
  );
  return Object.fromEntries(rows.map((row) => [row.id, row.review_window_hours]));
}

describe.each(databases)("migrations 034 and 035 (%s)", (_name, make) => {
  it("credits workspace links to the workspace's owner, keeping any inviter they had", async () => {
    const { db, ana, ben } = await at033(make);
    expect(await migrate(db, UP_TO_035)).toEqual(NEW);
    expect(await inviters(db)).toEqual({
      anonymous: null,
      "by-ben": ben,
      "linked-1": ana,
      "linked-2": ana,
    });
  });

  it("changes nothing when it runs again", async () => {
    const { db, ana, ben } = await at033(make);
    await migrate(db, UP_TO_035);
    await db.query("UPDATE squint_shares SET review_window_hours = NULL WHERE id = 'linked-1'");
    await db.query("UPDATE squint_shares SET review_window_hours = 24 WHERE id = 'linked-2'");
    expect(await migrate(db, UP_TO_035)).toEqual([]);
    // By hand too: the backfill skips credited rows, the column and CHECK are already there.
    for (const migration of MIGRATIONS.filter((m) => NEW.includes(m.id))) {
      await db.query(migration.sql);
    }
    expect(await inviters(db)).toEqual({
      anonymous: null,
      "by-ben": ben,
      "linked-1": ana,
      "linked-2": ana,
    });
    expect(await windows(db)).toEqual({
      anonymous: 72,
      "by-ben": 72,
      "linked-1": null,
      "linked-2": 24,
    });
  });

  it("gives every existing share the 72 hours it had, and takes only 24, 72, 168 or none", async () => {
    const { db, workspaceId } = await at033(make);
    await migrate(db, UP_TO_035);
    expect(await windows(db)).toEqual({
      anonymous: 72,
      "by-ben": 72,
      "linked-1": 72,
      "linked-2": 72,
    });
    // A new row without the column reads 72 too; null (no limit) is only ever set on purpose.
    await db.query(
      `INSERT INTO projects (id, workspace_id, name, source)
       VALUES ('p4', $1, 'P', '{"kind":"url","url":"https://a.test/"}')`,
      [workspaceId],
    );
    await insertShare(db, "fresh", { workspaceId, projectId: "p4" });
    expect((await windows(db)).fresh).toBe(72);
    for (const hours of [24, 72, 168, null]) {
      await db.query("UPDATE squint_shares SET review_window_hours = $1 WHERE id = 'fresh'", [
        hours,
      ]);
    }
    for (const hours of [0, 1, 48, 169, -24]) {
      await expect(
        db.query("UPDATE squint_shares SET review_window_hours = $1 WHERE id = 'fresh'", [hours]),
      ).rejects.toThrow();
    }
  });
});
