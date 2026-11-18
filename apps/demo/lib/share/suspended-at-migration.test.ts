import { describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { PGlite } from "@electric-sql/pglite";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_045 = MIGRATIONS.slice(0, 45);
const SUSPENDED_AT = MIGRATIONS.find(({ id }) => id === "046_workspaces_suspended_at");

describe("046_workspaces_suspended_at", () => {
  it("leaves every workspace unsuspended, and changes nothing when it runs again", async () => {
    const db = adaptPglite(new PGlite());
    await migrate(db, UP_TO_045);
    await db.query("INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme')");
    expect(await migrate(db)).toContain("046_workspaces_suspended_at");
    await db.query(SUSPENDED_AT?.sql ?? "");
    const { rows } = await db.query<{ suspended_at: Date | null }>(
      "SELECT suspended_at FROM workspaces",
    );
    expect(rows).toEqual([{ suspended_at: null }]);
  });
});
