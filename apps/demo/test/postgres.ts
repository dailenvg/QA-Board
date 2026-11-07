import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { poolDatabase, type Database } from "@/lib/db/database";

/**
 * A throwaway local Postgres for the tests that want a real one
 * (`TEST_DATABASE_URL`, 127.0.0.1 or localhost only); undefined when unset,
 * and those tests skip.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim() || undefined;

if (
  TEST_DATABASE_URL &&
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(TEST_DATABASE_URL).hostname)
) {
  throw new Error("TEST_DATABASE_URL must point at 127.0.0.1 or localhost.");
}

/**
 * An empty schema of its own in the test database, as the search path of
 * every connection, so a test can migrate from nothing without touching
 * anything else there. `close` drops it.
 */
export async function freshSchema(url: string): Promise<{ db: Database; close(): Promise<void> }> {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}` });
  return {
    db: poolDatabase(pool),
    async close() {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}
