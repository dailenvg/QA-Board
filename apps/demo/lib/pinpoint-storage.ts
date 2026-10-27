import { createGitHubStorage, createMemoryStorage, type StorageAdapter } from "@pinpoint/server";
import { createPostgresStorage, migrate } from "@pinpoint/server/postgres";
import pg from "pg";

export type StorageKind = "github" | "postgres" | "memory";

const globalForPinpoint = globalThis as typeof globalThis & {
  pinpointMemoryStorage?: StorageAdapter;
};

/** Waits for migrations before every call, so the first request never races the schema. */
function afterMigrations(storage: StorageAdapter, ready: Promise<unknown>): StorageAdapter {
  const expire = storage.expire?.bind(storage);
  return {
    listPins: async (params) => {
      await ready;
      return storage.listPins(params);
    },
    createPin: async (draft) => {
      await ready;
      return storage.createPin(draft);
    },
    addReply: async (params) => {
      await ready;
      return storage.addReply(params);
    },
    resolvePin: async (params) => {
      await ready;
      return storage.resolvePin(params);
    },
    ...(expire && {
      expire: async (cutoff: number, deadline?: number) => {
        await ready;
        return expire(cutoff, deadline);
      },
    }),
  };
}

/**
 * Picks storage from the environment:
 * GitHub when GITHUB_TOKEN and GITHUB_REPO are set, else Postgres when
 * DATABASE_URL is set, else in-memory (local development and e2e).
 */
export function storageFromEnv(env: NodeJS.ProcessEnv = process.env): {
  kind: StorageKind;
  storage: StorageAdapter;
} {
  if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
    return {
      kind: "github",
      storage: createGitHubStorage({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO }),
    };
  }
  if (env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    return {
      kind: "postgres",
      storage: afterMigrations(createPostgresStorage({ pool }), migrate(pool)),
    };
  }
  // Survives hot reloads in `next dev`; resets when the server restarts.
  globalForPinpoint.pinpointMemoryStorage ??= createMemoryStorage();
  return { kind: "memory", storage: globalForPinpoint.pinpointMemoryStorage };
}
