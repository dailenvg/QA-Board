import { PGlite } from "@electric-sql/pglite";
import { Kysely, PostgresDialect, sql } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { databasePool } from "./database-pool";
import type { Database } from "./database";

interface Tables {
  notes: { id: number; body: string };
}

let db: Database;
let kysely: Kysely<Tables>;

beforeEach(async () => {
  db = adaptPglite(new PGlite());
  await db.query("CREATE TABLE notes (id int PRIMARY KEY, body text NOT NULL)");
  kysely = new Kysely<Tables>({ dialect: new PostgresDialect({ pool: databasePool(db) }) });
});

const bodies = async () =>
  (await db.query<{ body: string }>("SELECT body FROM notes ORDER BY id")).rows.map((r) => r.body);

describe("databasePool", () => {
  it("runs Kysely's queries on the database, with the rows each one touched", async () => {
    await kysely.insertInto("notes").values({ id: 1, body: "one" }).execute();
    await kysely.insertInto("notes").values({ id: 2, body: "two" }).execute();
    const updated = await kysely.updateTable("notes").set({ body: "both" }).executeTakeFirst();
    expect(updated.numUpdatedRows).toBe(2n);
    const deleted = await kysely.deleteFrom("notes").where("id", "=", 1).executeTakeFirst();
    expect(deleted.numDeletedRows).toBe(1n);
    expect(await kysely.selectFrom("notes").select("body").execute()).toEqual([{ body: "both" }]);
  });

  it("commits a transaction as one", async () => {
    await kysely.transaction().execute(async (trx) => {
      await trx.insertInto("notes").values({ id: 1, body: "one" }).execute();
      await trx.insertInto("notes").values({ id: 2, body: "two" }).execute();
    });
    expect(await bodies()).toEqual(["one", "two"]);
  });

  it("rolls back a transaction that throws, and passes the error on", async () => {
    const failure = new Error("stop");
    await expect(
      kysely.transaction().execute(async (trx) => {
        await trx.insertInto("notes").values({ id: 1, body: "one" }).execute();
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await bodies()).toEqual([]);
  });

  it("rolls back when a statement inside fails", async () => {
    await expect(
      kysely.transaction().execute(async (trx) => {
        await trx.insertInto("notes").values({ id: 1, body: "one" }).execute();
        await trx.insertInto("notes").values({ id: 1, body: "again" }).execute();
      }),
    ).rejects.toThrow();
    expect(await bodies()).toEqual([]);
  });

  it("applies a transaction's settings", async () => {
    const level = await kysely
      .transaction()
      .setIsolationLevel("serializable")
      .execute(async (trx) => {
        const { rows } = await sql<{
          transaction_isolation: string;
        }>`SHOW transaction_isolation`.execute(trx);
        return rows[0]?.transaction_isolation;
      });
    expect(level).toBe("serializable");
  });

  it("never ends the app's pool", async () => {
    await kysely.destroy();
    expect(await bodies()).toEqual([]);
  });
});
