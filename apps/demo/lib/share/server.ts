import { Pool } from "pg";
import { inlineBackend, vercelBackend, type BlobBackend } from "./blob-backend";
import { createMemoryStore } from "./memory-store";
import { migrate } from "./migrate";
import { createPostgresStore } from "./postgres-store";
import type { ShareStore } from "./store";

export interface ShareServices {
  store: ShareStore;
  blobs: BlobBackend;
}

/** Reads DATABASE_URL and VERCEL_ENV. */
type StorageEnv = Readonly<Record<string, string | undefined>>;

/**
 * Whether this server can keep a new share. Without `DATABASE_URL` shares
 * live in one instance's memory; on a Vercel production or preview deployment
 * the next request often lands on another instance, so the link would open
 * as "not available". There, creating one fails instead. Local runs and the
 * e2e server (no VERCEL_ENV, or `vercel dev`'s "development") keep memory.
 */
export function canCreateShares(env: StorageEnv = process.env): boolean {
  if (env.DATABASE_URL) return true;
  return env.VERCEL_ENV !== "production" && env.VERCEL_ENV !== "preview";
}

const holder = globalThis as typeof globalThis & { squintShares?: Promise<ShareServices> };

async function connect(): Promise<ShareServices> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const blobs = token ? vercelBackend(token) : inlineBackend;
  const url = process.env.DATABASE_URL;
  if (!url) return { store: createMemoryStore(), blobs };
  const pool = new Pool({ connectionString: url, max: 3 });
  await migrate(pool);
  return { store: createPostgresStore(pool), blobs };
}

/**
 * The share store for this server: Postgres when `DATABASE_URL` is set
 * (migrated on first use), else memory, which is per instance and lost on
 * restart (local use only; see `canCreateShares`). Images go to Vercel Blob when
 * `BLOB_READ_WRITE_TOKEN` is set, else into the store.
 */
export function shareServices(): Promise<ShareServices> {
  holder.squintShares ??= connect().catch((error: unknown) => {
    holder.squintShares = undefined;
    throw error;
  });
  return holder.squintShares;
}
