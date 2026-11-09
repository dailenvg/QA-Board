import { Pool, type PoolClient } from "pg";
import { describeError } from "../auth/http";
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
 * How long to wait for Postgres before giving up: to open a connection
 * (Neon wakes a sleeping compute within it), and for any one query's answer.
 * A connection that died silently (Neon dropped it while Vercel had the
 * function frozen) then fails instead of hanging every request behind it.
 * Well above the slowest legitimate query: cron and import work in batches,
 * and migrations stop themselves sooner (`MIGRATION_TIMEOUTS`).
 */
export const CONNECT_TIMEOUT_MS = 10_000;
export const QUERY_TIMEOUT_MS = 30_000;
/** Idle time before the first TCP keepalive probe. */
const KEEPALIVE_DELAY_MS = 10_000;

/**
 * A pool on the app's Postgres at `url` with the timeouts above, and TCP
 * keepalive so the OS notices a dead peer, its idle errors logged under
 * `label` (`watchPool`).
 */
export function openPool(url: string, label: string, max?: number): Pool {
  const pool = new Pool({
    connectionString: url,
    max,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: KEEPALIVE_DELAY_MS,
  });
  return watchPool(pool, label);
}

/** `pg`'s own timeouts carry no code, only these fixed messages (no values in them). */
const TIMEOUT_MESSAGES = new Set([
  "Query read timeout",
  "timeout exceeded when trying to connect",
  "Connection terminated due to connection timeout",
]);

function isTimeout(error: unknown): boolean {
  return error instanceof Error && TIMEOUT_MESSAGES.has(error.message);
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
    // A timed-out query still holds the connection, so a ROLLBACK would only
    // wait behind it. Dropping the connection rolls back on the server.
    broken = isTimeout(error);
    if (!broken) {
      await client.query("ROLLBACK").catch(() => {
        broken = true;
      });
    }
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
 * Server-side limits for one migration run, under `QUERY_TIMEOUT_MS` so
 * Postgres names the cause before the client gives up. Any statement, the
 * wait for the migration lock included, stops after 20 s: migrations are
 * small DDL that take milliseconds. Set after the lock is taken, a DDL
 * statement waits 10 s at most for a table lock instead of queuing every
 * query on that table behind it; the wait for another run's migrations keeps
 * the statement limit alone.
 */
export const MIGRATION_TIMEOUTS = {
  statement: "SET LOCAL statement_timeout = '20s'",
  lock: "SET LOCAL lock_timeout = '10s'",
} as const;

/**
 * Runs `run` (a migrate) in one transaction that first takes the migration
 * lock, so cold starts racing on an empty database apply each migration
 * once: the others wait, then find it recorded. The lock ends with the
 * transaction, and a failed migration rolls back whole. A stuck statement or
 * lock fails within `MIGRATION_TIMEOUTS`.
 */
export function migrateWithLock<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return inTransaction(pool, async (client) => {
    await client.query(MIGRATION_TIMEOUTS.statement);
    await client.query(MIGRATION_LOCK);
    await client.query(MIGRATION_TIMEOUTS.lock);
    return run(client);
  });
}

const holder = globalThis as typeof globalThis & { squintDatabase?: Promise<Database> };

async function connect(url: string): Promise<Database> {
  const pool = openPool(url, "db", 3);
  await migrateWithLock(pool, migrate);
  return poolDatabase(pool);
}

/**
 * The app's Postgres (`DATABASE_URL`), migrated on first use and shared by
 * shares and accounts. Null when `DATABASE_URL` isn't set: shares fall back to
 * memory then, and nobody can sign in. A failed or timed-out connect is
 * logged by kind and forgotten, so the next call tries again. Await what this
 * returns: work left running after the response can be frozen mid-way.
 */
export function database(): Promise<Database> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  holder.squintDatabase ??= connect(url).catch((error: unknown) => {
    holder.squintDatabase = undefined;
    const kind = isTimeout(error) ? "timeout" : describeError(error);
    console.error(`squint db: connect failed (${kind})`);
    throw error;
  });
  return holder.squintDatabase;
}
