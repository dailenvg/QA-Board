import { Pool } from "pg";
import { migrate } from "../share/migrate";

const holder = globalThis as typeof globalThis & { squintDatabase?: Promise<Pool> };

async function connect(url: string): Promise<Pool> {
  const pool = new Pool({ connectionString: url, max: 3 });
  await migrate(pool);
  return pool;
}

/**
 * The app's Postgres pool (`DATABASE_URL`), migrated on first use and shared by
 * shares and accounts. Null when `DATABASE_URL` isn't set: shares fall back to
 * memory then, and nobody can sign in.
 */
export function database(): Promise<Pool> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  holder.squintDatabase ??= connect(url).catch((error: unknown) => {
    holder.squintDatabase = undefined;
    throw error;
  });
  return holder.squintDatabase;
}
