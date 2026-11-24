import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_052 = MIGRATIONS.slice(0, 52);
const NEW = ["053_comment_replies"];
/** Up to the last of `NEW`: later migrations have their own tests. */
const UP_TO_053 = MIGRATIONS.slice(0, 52 + NEW.length);

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

/**
 * A database at 053 with a member, a workspace and project p1 holding a page,
 * a snapshot and a comment on each of: the page (`on-page`), the snapshot
 * (`on-snapshot`), and neither (`loose`), plus project p2 with comment `other`.
 */
async function at053(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_052)).toHaveLength(52);
  expect(await migrate(db, UP_TO_053)).toEqual(NEW);
  const { rows: users } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, role) VALUES ('ana@acme.test', 'x', 'company') RETURNING id",
  );
  const userId = users[0]?.id ?? "";
  const { rows: workspaces } = await db.query<{ id: string }>(
    "INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme') RETURNING id",
  );
  const workspaceId = workspaces[0]?.id ?? "";
  for (const project of ["p1", "p2"]) {
    await db.query(
      `INSERT INTO projects (id, workspace_id, name, source)
       VALUES ($1, $2, 'P', '{"kind":"url","url":"https://a.test/"}')`,
      [project, workspaceId],
    );
  }
  await db.query(
    "INSERT INTO pages (project_id, id, blob_key, name, position) VALUES ('p1', 'pg', 'page:pg', 'A', 0)",
  );
  await db.query(
    `INSERT INTO snapshots (project_id, id, blob_key, width, height, source_url)
     VALUES ('p1', 'sn', 'snapshot:sn', 1, 1, 'https://a.test/')`,
  );
  const comments: Array<[string, string, string | null, string | null]> = [
    ["p1", "on-page", "pg", null],
    ["p1", "on-snapshot", null, "sn"],
    ["p1", "loose", null, null],
    ["p2", "other", null, null],
  ];
  for (const [project, id, page, snapshot] of comments) {
    await db.query(
      `INSERT INTO comments (project_id, id, x, y, body, author_name, page_id, snapshot_id)
       VALUES ($1, $2, 1, 1, 'Hi', 'Ana', $3, $4)`,
      [project, id, page, snapshot],
    );
    await reply(db, project, id, `${id}-reply`, userId);
  }
  return { db, userId, workspaceId };
}

function reply(
  db: Database,
  project: string,
  comment: string,
  id: string,
  userId: string | null = null,
  extra: { origin?: string; clientInfo?: string } = {},
) {
  return db.query(
    `INSERT INTO comment_replies
       (project_id, comment_id, id, body, author_name, author_user_id, origin, client_info)
     VALUES ($1, $2, $3, 'Thanks', 'Ana', $4, $5, $6::jsonb)`,
    [project, comment, id, userId, extra.origin ?? "team", extra.clientInfo ?? null],
  );
}

async function replyIds(db: Database): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>("SELECT id FROM comment_replies ORDER BY id");
  return rows.map((row) => row.id);
}

describe.each(databases)("migration 053 (%s)", (_name, make) => {
  it("keeps replies to an existing comment, with a team or client origin and browser details as an object", async () => {
    const { db } = await at053(make);
    expect(await replyIds(db)).toEqual([
      "loose-reply",
      "on-page-reply",
      "on-snapshot-reply",
      "other-reply",
    ]);
    const { rows } = await db.query<{ created_at: Date; edited_at: Date | null }>(
      "SELECT created_at, edited_at FROM comment_replies WHERE id = 'loose-reply'",
    );
    expect(rows[0]?.created_at).toBeInstanceOf(Date);
    expect(rows[0]?.edited_at).toBeNull();
    await reply(db, "p1", "loose", "client", null, {
      origin: "client",
      clientInfo: '{"userAgent":"Mozilla/5.0"}',
    });
    await expect(reply(db, "p1", "nope", "r1"), "unknown comment").rejects.toThrow();
    await expect(reply(db, "p2", "loose", "r1"), "another project's").rejects.toThrow();
    await expect(reply(db, "p1", "loose", "loose-reply"), "taken id").rejects.toThrow();
    await expect(reply(db, "p1", "loose", "r1", null, { origin: "guest" })).rejects.toThrow();
    for (const value of ['"Mozilla/5.0"', "[1, 2]", "42", "null", "true"]) {
      await expect(
        reply(db, "p1", "loose", "r2", null, { clientInfo: value }),
        value,
      ).rejects.toThrow();
    }
  });

  it("deletes replies with their comment, its page or snapshot, its project and a purged workspace", async () => {
    const { db, userId, workspaceId } = await at053(make);
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    const { rows } = await db.query<{ author_user_id: string | null; author_name: string }>(
      "SELECT DISTINCT author_user_id, author_name FROM comment_replies",
    );
    expect(rows, "an author's account going keeps the reply").toEqual([
      { author_user_id: null, author_name: "Ana" },
    ]);
    await db.query("DELETE FROM comments WHERE project_id = 'p1' AND id = 'loose'");
    expect(await replyIds(db)).toEqual(["on-page-reply", "on-snapshot-reply", "other-reply"]);
    await db.query("DELETE FROM pages WHERE project_id = 'p1' AND id = 'pg'");
    expect(await replyIds(db)).toEqual(["on-snapshot-reply", "other-reply"]);
    await db.query("DELETE FROM snapshots WHERE project_id = 'p1' AND id = 'sn'");
    expect(await replyIds(db)).toEqual(["other-reply"]);
    await reply(db, "p2", "other", "second");
    await db.query("DELETE FROM projects WHERE id = 'p2'");
    expect(await replyIds(db)).toEqual([]);
    await db.query(
      "INSERT INTO comments (project_id, id, x, y, body, author_name) VALUES ('p1', 'c', 1, 1, 'Hi', 'Ana')",
    );
    await reply(db, "p1", "c", "last");
    await db.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    expect(await replyIds(db)).toEqual([]);
  });

  it("changes nothing when it runs again", async () => {
    const { db } = await at053(make);
    expect(await migrate(db, UP_TO_053)).toEqual([]);
    for (const id of NEW) await db.query(MIGRATIONS.find((m) => m.id === id)?.sql ?? "");
    expect(await replyIds(db)).toHaveLength(4);
    await expect(reply(db, "p1", "loose", "r1", null, { clientInfo: "[]" })).rejects.toThrow();
    await db.query("DELETE FROM comments WHERE project_id = 'p1' AND id = 'loose'");
    expect(await replyIds(db)).toHaveLength(3);
  });
});
