import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import type { Database } from "../db/database";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_053 = MIGRATIONS.slice(0, 53);
const NEW = ["054_squint_share_replies"];
/** Up to the last of `NEW`: later migrations have their own tests. */
const UP_TO_054 = MIGRATIONS.slice(0, 53 + NEW.length);

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
 * A database at 054 with review links s1 (comments c1 and c2) and s2 (comment
 * c1, the same id on another link), and a reply under each comment.
 */
async function at054(make: () => Promise<Database>) {
  const db = await make();
  expect(await migrate(db, UP_TO_053)).toHaveLength(53);
  expect(await migrate(db, UP_TO_054)).toEqual(NEW);
  for (const [index, share] of ["s1", "s2"].entries()) {
    await db.query(
      `INSERT INTO squint_shares
         (id, token_hash, owner_key_hash, project, created_at, updated_at, expires_at)
       VALUES ($1, $2, $3, '{}'::jsonb, 1, 1, 2)`,
      [share, String(index).repeat(64), String(index + 2).repeat(64)],
    );
  }
  const comments: Array<[string, string]> = [
    ["s1", "c1"],
    ["s1", "c2"],
    ["s2", "c1"],
  ];
  for (const [share, id] of comments) {
    await db.query(
      `INSERT INTO squint_share_comments (share_id, id, data, origin)
       VALUES ($1, $2, '{"body":"Hi"}'::jsonb, 'owner')`,
      [share, id],
    );
    await reply(db, share, id, `${share}-${id}-reply`);
  }
  return db;
}

function reply(
  db: Database,
  share: string,
  comment: string,
  id: string,
  extra: { origin?: string; clientInfo?: string } = {},
) {
  return db.query(
    `INSERT INTO squint_share_replies (share_id, comment_id, id, data, origin, client_info)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb)`,
    [share, comment, id, '{"body":"Thanks"}', extra.origin ?? "owner", extra.clientInfo ?? null],
  );
}

async function replyIds(db: Database): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    "SELECT id FROM squint_share_replies ORDER BY id",
  );
  return rows.map((row) => row.id);
}

describe.each(databases)("migration 054 (%s)", (_name, make) => {
  it("keeps replies to a comment on the same link, from the owner or a client, on the link's sequence", async () => {
    const db = await at054(make);
    expect(await replyIds(db)).toEqual(["s1-c1-reply", "s1-c2-reply", "s2-c1-reply"]);
    await reply(db, "s1", "c1", "client", {
      origin: "client",
      clientInfo: '{"userAgent":"Mozilla/5.0"}',
    });
    const { rows } = await db.query<{ seq: string; comment_seq: string; client_info: unknown }>(
      `SELECT reply.seq, comment.seq AS comment_seq, reply.client_info
       FROM squint_share_replies AS reply
       JOIN squint_share_comments AS comment
         ON comment.share_id = reply.share_id AND comment.id = reply.comment_id
       WHERE reply.id = 'client'`,
    );
    expect(Number(rows[0]?.seq)).toBeGreaterThan(Number(rows[0]?.comment_seq));
    expect(rows[0]?.client_info).toEqual({ userAgent: "Mozilla/5.0" });
    await expect(reply(db, "s1", "nope", "r1"), "unknown comment").rejects.toThrow();
    await expect(reply(db, "s2", "c2", "r1"), "another link's comment").rejects.toThrow();
    await expect(reply(db, "s1", "c2", "s1-c1-reply"), "taken id").rejects.toThrow();
    await expect(reply(db, "s1", "c1", "r1", { origin: "team" })).rejects.toThrow();
    for (const value of ['"Mozilla/5.0"', "[1, 2]", "42", "null", "true"]) {
      await expect(reply(db, "s1", "c1", "r2", { clientInfo: value }), value).rejects.toThrow();
    }
  });

  it("deletes replies with their comment and with their link", async () => {
    const db = await at054(make);
    await db.query("DELETE FROM squint_share_comments WHERE share_id = 's1' AND id = 'c1'");
    expect(await replyIds(db)).toEqual(["s1-c2-reply", "s2-c1-reply"]);
    await db.query("DELETE FROM squint_shares WHERE id = 's1'");
    expect(await replyIds(db)).toEqual(["s2-c1-reply"]);
  });

  it("changes nothing when it runs again", async () => {
    const db = await at054(make);
    expect(await migrate(db, UP_TO_054)).toEqual([]);
    for (const id of NEW) await db.query(MIGRATIONS.find((m) => m.id === id)?.sql ?? "");
    expect(await replyIds(db)).toHaveLength(3);
    await expect(reply(db, "s1", "c1", "r1", { clientInfo: "[]" })).rejects.toThrow();
    await expect(reply(db, "s1", "c1", "r1", { origin: "guest" })).rejects.toThrow();
    await db.query("DELETE FROM squint_share_comments WHERE share_id = 's2' AND id = 'c1'");
    expect(await replyIds(db)).toHaveLength(2);
  });
});
