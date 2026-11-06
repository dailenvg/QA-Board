import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { E2E_ADMIN, E2E_COMPANY, e2eDatabaseUrl } from "./e2e-env";

/** Empties every table but the migration record, so each run starts from the same seed. */
async function truncate(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string }>(
      `SELECT quote_ident(tablename) AS name FROM pg_tables
       WHERE schemaname = 'public' AND tablename <> 'squint_migrations'`,
    );
    if (rows.length > 0) {
      await client.query(
        `TRUNCATE ${rows.map((row) => row.name).join(", ")} RESTART IDENTITY CASCADE`,
      );
    }
  } finally {
    await client.end();
  }
}

/**
 * Before any test: empties the e2e database, then runs the real seed script
 * against it (which migrates first), creating the e2e admin and workspace.
 * Signing in happens in `auth.setup.ts`, once the server is up.
 */
export default async function globalSetup(): Promise<void> {
  const url = e2eDatabaseUrl();
  await truncate(url);
  execFileSync("pnpm", ["run", "--silent", "seed:accounts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: url,
      ADMIN_EMAIL: E2E_ADMIN.email,
      ADMIN_PASSWORD: E2E_ADMIN.password,
      COMPANY_SLUG: E2E_COMPANY.slug,
      COMPANY_NAME: E2E_COMPANY.name,
      COMPANY_EMAIL: E2E_COMPANY.email,
      COMPANY_PASSWORD: E2E_COMPANY.password,
    },
  });
}
