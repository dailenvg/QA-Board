import { Pool } from "pg";
import { migrate, type Queryable } from "../share/migrate";

/**
 * A database that can also run several statements as one transaction on one
 * connection (a pooled `pg` client in the app, PGlite's own in tests). Needed
 * where a lock must cover a read and a write, such as the login rate limit.
 */
export interface Database extends Queryable {
  transaction<T>(run: (tx: Queryable) => Promise<T>): Promise<T>;
}

/** `pool` as a `Database`: queries go to the pool, transactions to one client of it. */
export function poolDatabase(pool: Pool): Database {
  const queries: Queryable = pool;
  return {
    query: queries.query.bind(pool),
    async transaction(run) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await run(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

const holder = globalThis as typeof globalThis & { squintDatabase?: Promise<Database> };

async function connect(url: string): Promise<Database> {
  const pool = new Pool({ connectionString: url, max: 3 });
  await migrate(pool);
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
