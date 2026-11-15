import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_042 = MIGRATIONS.slice(0, 42);
const NEW = ["043_workspaces_seat_limit", "044_workspace_invites"];
/** Up to the last of `NEW`: later migrations have their own tests. */
const UP_TO_044 = MIGRATIONS.slice(0, 42 + NEW.length);

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

/** A database at 042 with a workspace, its owner and a member who deleted their account. */
async function at042(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_042)).toHaveLength(42);
  const { rows: workspaces } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  const workspaceId = workspaces[0]?.id ?? "";
  const { rows: users } = await db.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, deleted_at, delete_after)
     VALUES ('ana@acme.test', 'x', 'company', NULL, NULL),
            ('ben@acme.test', 'x', 'company', now(), now() + interval '30 days')
     RETURNING id`,
  );
  return { db, workspaceId, ownerId: users[0]?.id ?? "", benId: users[1]?.id ?? "" };
}

const HASH = "a".repeat(64);

/** An invite row with `values` over a valid one's. */
function invite(db: Database, workspaceId: string, values: Record<string, unknown> = {}) {
  const row = {
    workspace_id: workspaceId,
    email: "cleo@x.test",
    token_hash: HASH,
    token_sealed: "v1.sealed",
    expires_at: new Date(Date.now() + 1000),
    ...values,
  };
  const columns = Object.keys(row);
  return db.query(
    `INSERT INTO workspace_invites (${columns.join(", ")})
     VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING *`,
    Object.values(row),
  );
}

describe.each(databases)("migrations 043 and 044 (%s)", (_name, make) => {
  it("gives every workspace 10 seats, and leaves every account unremoved", async () => {
    const { db } = await at042(make);
    expect(await migrate(db, UP_TO_044)).toEqual(NEW);
    expect((await db.query("SELECT seat_limit FROM workspaces")).rows).toEqual([
      { seat_limit: 10 },
    ]);
    const { rows } = await db.query(
      "SELECT removed_from, removed_permissions FROM users ORDER BY email",
    );
    expect(rows).toEqual([
      { removed_from: null, removed_permissions: null },
      { removed_from: null, removed_permissions: null },
    ]);
  });

  it("keeps a seat limit from 1 to 100", async () => {
    const { db } = await at042(make);
    await migrate(db, UP_TO_044);
    for (const ok of [1, 100]) await db.query("UPDATE workspaces SET seat_limit = $1", [ok]);
    for (const bad of [0, 101, null]) {
      await expect(
        db.query("UPDATE workspaces SET seat_limit = $1", [bad]),
        String(bad),
      ).rejects.toThrow();
    }
  });

  it("makes an invite a member's, open, 0 sends, with the default switches", async () => {
    const { db, workspaceId } = await at042(make);
    await migrate(db, UP_TO_044);
    const { rows } = await invite(db, workspaceId);
    expect(rows[0]).toMatchObject({
      role: "member",
      send_count: 0,
      accepted_at: null,
      revoked_at: null,
      last_sent_at: null,
      last_send_error_at: null,
      permissions: ["review_links", "trash", "import"],
    });
  });

  it("refuses an invite that carries the people switch, or anything unknown", async () => {
    const { db, workspaceId } = await at042(make);
    await migrate(db, UP_TO_044);
    for (const permissions of [["people"], ["trash", "people"], ["admin"]]) {
      await expect(invite(db, workspaceId, { permissions }), permissions.join()).rejects.toThrow(
        /workspace_invites_permissions_known/,
      );
    }
    await invite(db, workspaceId, { permissions: [] });
  });

  it("checks the address, the role, the token's hash, the count and how an invite ends", async () => {
    const { db, workspaceId, ownerId } = await at042(make);
    await migrate(db, UP_TO_044);
    const bad: Array<Record<string, unknown>> = [
      { email: "Cleo@x.test" },
      { email: " cleo@x.test" },
      { email: "nobody" },
      { role: "owner" },
      { token_hash: "not-a-hash" },
      { send_count: -1 },
      { accepted_at: new Date(), revoked_at: new Date(), accepted_user_id: ownerId },
    ];
    for (const values of bad) {
      await expect(invite(db, workspaceId, values), JSON.stringify(values)).rejects.toThrow();
    }
  });

  it("holds one open invite per address, and any number that ended", async () => {
    const { db, workspaceId } = await at042(make);
    await migrate(db, UP_TO_044);
    await invite(db, workspaceId, { revoked_at: new Date(), token_hash: "b".repeat(64) });
    await invite(db, workspaceId, { accepted_at: new Date(), token_hash: "c".repeat(64) });
    await invite(db, workspaceId);
    await expect(invite(db, workspaceId, { token_hash: "d".repeat(64) })).rejects.toThrow(
      /workspace_invites_open_email_idx|duplicate key/,
    );
    await expect(invite(db, workspaceId, { email: "dan@x.test" })).rejects.toThrow(
      /duplicate key|token_hash/,
    );
  });

  it("deletes a workspace's invites and sends with it, and forgets who made them", async () => {
    const { db, workspaceId, ownerId } = await at042(make);
    await migrate(db, UP_TO_044);
    await invite(db, workspaceId, { invited_by: ownerId });
    await db.query("INSERT INTO workspace_invite_sends (workspace_id) VALUES ($1), ($1)", [
      workspaceId,
    ]);
    await db.query("UPDATE users SET removed_from = $1 WHERE email = 'ben@acme.test'", [
      workspaceId,
    ]);
    await db.query("DELETE FROM users WHERE id = $1", [ownerId]);
    expect((await db.query("SELECT invited_by FROM workspace_invites")).rows).toEqual([
      { invited_by: null },
    ]);
    await db.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    expect((await db.query("SELECT 1 FROM workspace_invites")).rows).toEqual([]);
    expect((await db.query("SELECT 1 FROM workspace_invite_sends")).rows).toEqual([]);
    expect((await db.query("SELECT removed_from FROM users")).rows).toEqual([
      { removed_from: null },
    ]);
  });

  it("keeps a removed account's switches to the four 041 knows", async () => {
    const { db, benId } = await at042(make);
    await migrate(db, UP_TO_044);
    const set = "UPDATE users SET removed_permissions = $2::text[] WHERE id = $1";
    await db.query(set, [benId, ["review_links", "people"]]);
    await db.query(set, [benId, []]);
    await db.query(set, [benId, null]);
    await expect(db.query(set, [benId, ["owner"]])).rejects.toThrow(
      /users_removed_permissions_known/,
    );
  });

  it("changes nothing when it runs again", async () => {
    const { db, workspaceId, benId } = await at042(make);
    await migrate(db, UP_TO_044);
    await db.query("UPDATE workspaces SET seat_limit = 12");
    await invite(db, workspaceId);
    await db.query(
      "UPDATE users SET removed_from = $2, removed_permissions = ARRAY['trash'] WHERE id = $1",
      [benId, workspaceId],
    );
    expect(await migrate(db, UP_TO_044)).toEqual([]);
    for (const id of NEW) await db.query(MIGRATIONS.find((m) => m.id === id)?.sql ?? "");
    expect((await db.query("SELECT seat_limit FROM workspaces")).rows).toEqual([
      { seat_limit: 12 },
    ]);
    expect((await db.query("SELECT email FROM workspace_invites")).rows).toEqual([
      { email: "cleo@x.test" },
    ]);
    const { rows } = await db.query(
      "SELECT removed_from, removed_permissions FROM users WHERE id = $1",
      [benId],
    );
    expect(rows).toEqual([{ removed_from: workspaceId, removed_permissions: ["trash"] }]);
    await expect(db.query("UPDATE workspaces SET seat_limit = 0")).rejects.toThrow();
    await expect(
      invite(db, workspaceId, { permissions: ["people"], email: "z@x.test" }),
    ).rejects.toThrow();
  });
});
