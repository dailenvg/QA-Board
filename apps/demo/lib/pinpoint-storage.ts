import { createGitHubStorage, createMemoryStorage, type StorageAdapter } from "@pinpoint/server";
import { createPostgresStorage, migrate } from "@pinpoint/server/postgres";
import { migrateWithLock, openPool } from "./db/database";

export type StorageKind = "github" | "postgres" | "memory";

const globalForPinpoint = globalThis as typeof globalThis & {
  pinpointMemoryStorage?: StorageAdapter;
};

/**
 * Waits for migrations before every call, so the first request never races
 * the schema. They start with the first call, which waits for them, and a
 * failed or timed-out run is forgotten so the next call tries again.
 */
function afterMigrations(
  storage: StorageAdapter,
  runMigrations: () => Promise<unknown>,
): StorageAdapter {
  let migrated: Promise<unknown> | undefined;
  const ready = () =>
    (migrated ??= runMigrations().catch((error: unknown) => {
      migrated = undefined;
      throw error;
    }));
  const expire = storage.expire?.bind(storage);
  return {
    listPins: async (params) => {
      await ready();
      return storage.listPins(params);
    },
    createPin: async (draft) => {
      await ready();
      return storage.createPin(draft);
    },
    addReply: async (params) => {
      await ready();
      return storage.addReply(params);
    },
    resolvePin: async (params) => {
      await ready();
      return storage.resolvePin(params);
    },
    ...(expire && {
      expire: async (cutoff: number, deadline?: number) => {
        await ready();
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
    const pool = openPool(env.DATABASE_URL, "pinpoint");
    return {
      kind: "postgres",
      storage: afterMigrations(createPostgresStorage({ pool }), () =>
        migrateWithLock(pool, migrate),
      ),
    };
  }
  // Survives hot reloads in `next dev`; resets when the server restarts.
  globalForPinpoint.pinpointMemoryStorage ??= createMemoryStorage();
  return { kind: "memory", storage: globalForPinpoint.pinpointMemoryStorage };
}
