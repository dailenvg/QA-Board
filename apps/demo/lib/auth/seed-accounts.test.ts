import { describe, expect, it } from "vitest";
import { NOW } from "@/test/accounts-fixture";
import { migratedPglite } from "@/test/pglite";
import { logIn } from "./login";
import { seedAccounts, seedInputFromEnv, SeedError, type SeedInput } from "./seed-accounts";

const ENV = {
  DATABASE_URL: "postgres://localhost/squint",
  ADMIN_EMAIL: "Admin@Squint.test",
  ADMIN_PASSWORD: "admin password 123",
  COMPANY_SLUG: "one-agency",
  COMPANY_NAME: "ONE Agency",
  COMPANY_EMAIL: "squint@agency.test",
  COMPANY_PASSWORD: "company password 123",
};

function input(): SeedInput {
  const parsed = seedInputFromEnv(ENV);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.input;
}

describe("seedInputFromEnv", () => {
  it("normalizes emails and trims names", () => {
    const parsed = seedInputFromEnv({ ...ENV, COMPANY_NAME: "  ONE Agency " });
    expect(parsed).toMatchObject({
      ok: true,
      input: { admin: { email: "admin@squint.test" }, company: { name: "ONE Agency" } },
    });
  });

  it("names every bad variable without echoing passwords", () => {
    const parsed = seedInputFromEnv({
      ...ENV,
      ADMIN_PASSWORD: "too-short",
      COMPANY_SLUG: "ONE Agency",
      COMPANY_EMAIL: undefined,
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems).toEqual([
      "ADMIN_PASSWORD must be 12 to 256 characters",
      "COMPANY_SLUG must be lowercase letters, digits and single hyphens",
      "COMPANY_EMAIL is required",
    ]);
    expect(parsed.problems.join(" ")).not.toContain("too-short");
  });

  it("refuses the same email for both accounts", () => {
    expect(seedInputFromEnv({ ...ENV, COMPANY_EMAIL: ENV.ADMIN_EMAIL })).toEqual({
      ok: false,
      problems: ["ADMIN_EMAIL and COMPANY_EMAIL must differ"],
    });
  });
});

describe("seedAccounts", () => {
  it("creates the admin, the workspace and its owner, who can then sign in", async () => {
    const db = await migratedPglite();
    expect(await seedAccounts(db, input())).toEqual({
      admin: "created",
      workspace: "created",
      company: "created",
      owner: "created",
    });
    const { rows } = await db.query<{ email: string; role: string; ws: string | null }>(
      `SELECT u.email, u.role, w.slug AS ws FROM users AS u
       LEFT JOIN memberships AS m ON m.user_id = u.id AND m.role = 'owner'
       LEFT JOIN workspaces AS w ON w.id = m.workspace_id ORDER BY u.role`,
    );
    expect(rows).toEqual([
      { email: "admin@squint.test", role: "admin", ws: null },
      { email: "squint@agency.test", role: "company", ws: "one-agency" },
    ]);
    const ip = "203.0.113.9";
    for (const [emailVar, passwordVar] of [
      ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
      ["COMPANY_EMAIL", "COMPANY_PASSWORD"],
    ] as const) {
      const result = await logIn(db, { email: ENV[emailVar], password: ENV[passwordVar], ip }, NOW);
      expect(result.ok).toBe(true);
    }
  });

  it("changes nothing on a second run, never overwriting a password hash", async () => {
    const db = await migratedPglite();
    await seedAccounts(db, input());
    const snapshot = async () =>
      db.query("SELECT email, password_hash FROM users ORDER BY email").then(({ rows }) => rows);
    const before = await snapshot();
    const audit = await db.query("SELECT count(*)::int AS count FROM audit_log");
    const changed = { ...input(), admin: { ...input().admin, password: "a different password" } };

    expect(await seedAccounts(db, changed)).toEqual({
      admin: "kept",
      workspace: "kept",
      company: "kept",
      owner: "kept",
    });
    expect(await snapshot()).toEqual(before);
    expect((await db.query("SELECT count(*)::int AS count FROM audit_log")).rows).toEqual(
      audit.rows,
    );
  });

  it("refuses a role clash and another owner, leaving nothing half-done", async () => {
    const db = await migratedPglite();
    await db.query(
      "INSERT INTO users (email, password_hash, role) VALUES ('admin@squint.test', 'x', 'company')",
    );
    await expect(seedAccounts(db, input())).rejects.toThrow(SeedError);
    const { rows } = await db.query("SELECT 1 FROM workspaces");
    expect(rows).toEqual([]);

    const other = await migratedPglite();
    await seedAccounts(other, input());
    const takeover = { ...input(), company: { ...input().company, email: "new@agency.test" } };
    await expect(seedAccounts(other, takeover)).rejects.toThrow(/different owner/);
    const users = await other.query("SELECT 1 FROM users WHERE email = 'new@agency.test'");
    expect(users.rows).toEqual([]);
  });
});
