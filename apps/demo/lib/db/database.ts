import { Pool, type PoolClient } from "pg";
import { migrate, type Queryable } from "../share/migrate";

/**
 * A database that can also run several statements as one transaction on one
 * connection (a pooled `pg` client in the app, PGlite's own in tests). Needed
 * where a lock must cover a read and a write, such as the login rate limit.
 */
export interface Database extends Queryable {
  transaction<T>(run: (tx: Queryable) => Promise<T>): Promise<T>;
}

/**
 * Runs `run` on one client of `pool` between BEGIN and COMMIT, rolling back
 * if it throws.
 */
async function inTransaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  // A client that can't even roll back is broken: drop it instead of pooling it again.
  let broken = false;
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
      broken = true;
    });
    throw error;
  } finally {
    client.release(broken);
  }
}

/** `pool` as a `Database`: queries go to the pool, transactions to one client of it. */
export function poolDatabase(pool: Pool): Database {
  const queries: Queryable = pool;
  return {
    query: queries.query.bind(pool),
    transaction: (run) => inTransaction(pool, run),
  };
}

/**
 * Logs errors on idle pooled connections (Neon closes them when its compute
 * sleeps). Without a listener, `pg` re-throws them and they crash the request
 * in flight. The pool drops the dead connection and opens a new one on demand.
 */
export function watchPool(pool: Pool, label: string): Pool {
  pool.on("error", (error) => {
    console.warn(`squint ${label}: idle database connection closed (${error.message})`);
  });
  return pool;
}

/**
 * One advisory lock for every migration run against this database, Squint's
 * and Pinpoint's alike. They run at most once per cold start, so sharing a
 * key costs a few milliseconds of waiting and spares a second constant.
 */
const MIGRATION_LOCK = "SELECT pg_advisory_xact_lock(hashtextextended('squint:migrate', 0))";

/**
 * Runs `run` (a migrate) in one transaction that first takes the migration
 * lock, so cold starts racing on an empty database apply each migration
 * once: the others wait, then find it recorded. The lock ends with the
 * transaction, and a failed migration rolls back whole.
 */
export function migrateWithLock<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return inTransaction(pool, async (client) => {
    await client.query(MIGRATION_LOCK);
    return run(client);
  });
}

const holder = globalThis as typeof globalThis & { squintDatabase?: Promise<Database> };

async function connect(url: string): Promise<Database> {
  const pool = watchPool(new Pool({ connectionString: url, max: 3 }), "db");
  await migrateWithLock(pool, migrate);
  return poolDatabase(pool);
}

/**
 * The app's Postgres (`DATABASE_URL`), migrated on first use and shared by
 * shares and accounts. Null when `DATABASE_URL` isn't set: shares fall back to
 * memory then, and nobody can sign in.
 */
export function database(): Promise<Database> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  holder.squintDatabase ??= connect(url).catch((error: unknown) => {
    holder.squintDatabase = undefined;
    throw error;
  });
  return holder.squintDatabase;
}
