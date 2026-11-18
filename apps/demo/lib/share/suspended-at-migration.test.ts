import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { MIGRATIONS, migrate } from "./migrate";

const UP_TO_045 = MIGRATIONS.slice(0, 45);
const ADMIN_ACTIONS = MIGRATIONS.find(({ id }) => id === "046_workspaces_suspended_at");

describe("046_workspaces_suspended_at", () => {
  it("leaves every workspace unsuspended and every reset link emailed, and changes nothing again", async () => {
    const db = adaptPglite(new PGlite());
    await migrate(db, UP_TO_045);
    await db.query("INSERT INTO workspaces (slug, name) VALUES ('acme', 'Acme')");
    await db.query(
      "INSERT INTO users (email, password_hash, role) VALUES ('ana@acme.test', 'x', 'company')",
    );
    await db.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       SELECT id, repeat('a', 64), now() + interval '1 hour' FROM users`,
    );
    expect(await migrate(db)).toContain("046_workspaces_suspended_at");
    await db.query(ADMIN_ACTIONS?.sql ?? "");
    const { rows: workspaces } = await db.query<{ suspended_at: Date | null }>(
      "SELECT suspended_at FROM workspaces",
    );
    expect(workspaces).toEqual([{ suspended_at: null }]);
    const { rows: resets } = await db.query<{ by_admin: boolean }>(
      "SELECT by_admin FROM password_resets",
    );
    expect(resets).toEqual([{ by_admin: false }]);
  });
});
