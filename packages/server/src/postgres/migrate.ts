import init from "../../migrations/001_init.sql";
import type { Queryable } from "./postgres-storage";

/** Ordered migrations. Add new files here; never edit an applied one. */
export const MIGRATIONS: ReadonlyArray<{ id: string; sql: string }> = [
  { id: "001_init", sql: init },
];

const CREATE_LEDGER = `CREATE TABLE IF NOT EXISTS pinpoint_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;
const SELECT_APPLIED = "SELECT id FROM pinpoint_migrations";
const RECORD_APPLIED =
  "INSERT INTO pinpoint_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING";

/**
 * Applies pending migrations and returns the ids it ran. Safe to call on
 * every cold start: applied ids are recorded in `pinpoint_migrations` and
 * the SQL itself only uses `IF NOT EXISTS`, so concurrent runs are harmless.
 */
export async function migrate(pool: Queryable): Promise<string[]> {
  await pool.query(CREATE_LEDGER);
  const { rows } = await pool.query<{ id: string }>(SELECT_APPLIED);
  const applied = new Set(rows.map((row) => row.id));
  const ran: string[] = [];

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    await pool.query(migration.sql);
    await pool.query(RECORD_APPLIED, [migration.id]);
    ran.push(migration.id);
  }
  return ran;
}
