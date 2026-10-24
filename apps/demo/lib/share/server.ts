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
 * restart (local use only). Images go to Vercel Blob when
 * `BLOB_READ_WRITE_TOKEN` is set, else into the store.
 */
export function shareServices(): Promise<ShareServices> {
  holder.squintShares ??= connect().catch((error: unknown) => {
    holder.squintShares = undefined;
    throw error;
  });
  return holder.squintShares;
}
