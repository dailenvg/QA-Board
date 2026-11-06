/**
 * Creates the admin user, the company workspace and its owner from the seed
 * variables (ADMIN_EMAIL, ADMIN_PASSWORD, COMPANY_SLUG, COMPANY_NAME,
 * COMPANY_EMAIL, COMPANY_PASSWORD) in the Postgres at DATABASE_URL, after
 * running migrations. Reads the process environment only (no .env files), is
 * idempotent, and never prints a password.
 *
 *   pnpm --filter @pinpoint/demo seed:accounts
 */
import { Client } from "pg";
import { seedAccounts, seedInputFromEnv } from "../lib/auth/seed-accounts";
import { migrate } from "../lib/share/migrate";

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(line: string): void {
  process.stderr.write(`${line}\n`);
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const env = seedInputFromEnv(process.env);
  if (!env.ok) {
    for (const problem of env.problems) fail(`seed:accounts: ${problem}`);
    return;
  }
  const { input } = env;
  const client = new Client({ connectionString: env.databaseUrl });
  await client.connect();
  try {
    const ran = await migrate(client);
    print(ran.length > 0 ? `Migrations applied: ${ran.join(", ")}` : "Migrations: up to date");
    const report = await seedAccounts(client, input);
    print(`Admin ${input.admin.email}: ${report.admin}`);
    print(`Workspace ${input.company.slug}: ${report.workspace}`);
    print(`Company user ${input.company.email}: ${report.company}`);
    print(`Owner of ${input.company.slug}: ${report.owner === "created" ? "linked" : "kept"}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  fail(`seed:accounts failed: ${error instanceof Error ? error.message : String(error)}`);
});
