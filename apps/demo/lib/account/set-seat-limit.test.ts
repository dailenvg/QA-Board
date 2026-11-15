import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { migratedPglite } from "@/test/pglite";
import { seat, type Seat } from "@/test/workspace-fixture";
import type { Database } from "../db/database";

const sql = readFileSync(new URL("./set-seat-limit.sql", import.meta.url), "utf8");

/** The script with its numbered values filled in as the admin does: between their quotes. */
const filled = (...values: string[]) =>
  values.reduce(
    (text, value, index) =>
      text.replace(new RegExp(`'[^']*'(?=,? *-- ${index + 1}\\. )`), `'${value}'`),
    sql,
  );

let db: Database;
let acme: Seat;

beforeEach(async () => {
  db = await migratedPglite();
  acme = await seat(db, "acme");
  await seat(db, "bravo");
});

const limits = async () =>
  (await db.query("SELECT slug, seat_limit FROM workspaces ORDER BY slug")).rows;

describe("set-seat-limit.sql", () => {
  it("leaves its two values for the admin to fill in", () => {
    expect(filled("a", "b").match(/'[ab]',? *-- [12]\. /g)).toHaveLength(2);
  });

  it("sets one workspace's limit, by slug, answers old and new, and records it", async () => {
    const { rows } = await db.query(filled(" ACME ", " 25 "));
    expect(rows).toEqual([{ slug: "acme", old_limit: 10, new_limit: 25 }]);
    expect(await limits()).toEqual([
      { slug: "acme", seat_limit: 25 },
      { slug: "bravo", seat_limit: 10 },
    ]);
    const { rows: logged } = await db.query(
      "SELECT actor_user_id, workspace_id, action, target_id, meta FROM audit_log",
    );
    expect(logged).toEqual([
      {
        actor_user_id: null,
        workspace_id: acme.workspaceId,
        action: "workspace.settings_changed",
        target_id: acme.workspaceId,
        meta: { fields: ["seat_limit"] },
      },
    ]);
  });

  it("answers no rows for an unknown slug, and changes nothing", async () => {
    expect((await db.query(filled("nobody", "25"))).rows).toEqual([]);
    expect((await db.query("SELECT 1 FROM audit_log")).rows).toEqual([]);
  });

  it("fails, changing nothing, for a limit outside 1 to 100 or not a whole number", async () => {
    for (const [limit, error] of [
      ["0", /check constraint/],
      ["101", /check constraint/],
      ["ten", /invalid input syntax/],
      ["2.5", /invalid input syntax/],
    ] as const) {
      await expect(db.query(filled("acme", limit)), limit).rejects.toThrow(error);
    }
    expect(await limits()).toEqual([
      { slug: "acme", seat_limit: 10 },
      { slug: "bravo", seat_limit: 10 },
    ]);
  });
});
