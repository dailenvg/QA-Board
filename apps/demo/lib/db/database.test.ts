import { EventEmitter } from "node:events";
import {
  migrate as migratePinpoint,
  MIGRATIONS as PINPOINT_MIGRATIONS,
} from "@pinpoint/server/postgres";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import { silentPostgres } from "@/test/silent-postgres";
import { MIGRATIONS, migrate } from "../share/migrate";
import {
  CONNECT_TIMEOUT_MS,
  database,
  MIGRATION_TIMEOUTS,
  migrateWithLock,
  poolDatabase,
  QUERY_TIMEOUT_MS,
  watchPool,
  type Database,
} from "./database";

/**
 * A pool whose one client fails the queries named in `failing`, with an
 * error of that message unless `failure` says otherwise.
 */
function fakePool(failing: string[], failure = (sql: string) => new Error(sql)) {
  const release = vi.fn();
  const client = {
    query: vi.fn((sql: string) =>
      failing.includes(sql) ? Promise.reject(failure(sql)) : Promise.resolve({ rows: [] }),
    ),
    release,
  };
  const pool = { connect: () => Promise.resolve(client), query: vi.fn() } as unknown as Pool;
  return { pool, client, release };
}

const sent = (client: ReturnType<typeof fakePool>["client"]) =>
  client.query.mock.calls.map(([sql]) => sql);

describe("poolDatabase transactions", () => {
  it("returns the client to the pool after a rollback", async () => {
    const { pool, release } = fakePool(["SELECT 1"]);
    await expect(poolDatabase(pool).transaction((tx) => tx.query("SELECT 1"))).rejects.toThrow(
      "SELECT 1",
    );
    expect(release).toHaveBeenCalledWith(false);
  });

  it("drops a client that can't roll back", async () => {
    const { pool, release } = fakePool(["SELECT 1", "ROLLBACK"]);
    await expect(poolDatabase(pool).transaction((tx) => tx.query("SELECT 1"))).rejects.toThrow(
      "SELECT 1",
    );
    expect(release).toHaveBeenCalledWith(true);
  });

  it("drops a client whose query timed out without waiting on a rollback behind it", async () => {
    const { pool, client, release } = fakePool(["SELECT 1"], () => new Error("Query read timeout"));
    await expect(poolDatabase(pool).transaction((tx) => tx.query("SELECT 1"))).rejects.toThrow(
      "Query read timeout",
    );
    expect(sent(client)).not.toContain("ROLLBACK");
    expect(release).toHaveBeenCalledWith(true);
  });
});

describe("migrateWithLock", () => {
  it("bounds every statement, then lock waits once it holds the migration lock", async () => {
    const { pool, client } = fakePool([]);
    await migrateWithLock(pool, () => Promise.resolve([]));
    expect(sent(client)).toEqual([
      "BEGIN",
      MIGRATION_TIMEOUTS.statement,
      expect.stringContaining("pg_advisory_xact_lock"),
      MIGRATION_TIMEOUTS.lock,
      "COMMIT",
    ]);
  });
});

/**
 * `database()` against a local server that stops answering, the way a
 * connection Neon dropped behaves; fake timers stand in for the wait.
 */
describe("database() when Postgres stops answering", () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    for (const close of closers.splice(0)) await close();
  });

  async function stalledAt(silentAt: "connect" | "query") {
    const server = await silentPostgres(silentAt);
    closers.push(() => server.close());
    vi.stubEnv("DATABASE_URL", server.url);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    return server;
  }

  /**
   * Starts `database()`, waits for it to reach the silence, then lets `wait`
   * pass; returns the attempt (wrapped: returning it bare would rethrow).
   */
  async function timedOut(server: { stalled(): Promise<void> }, wait: number) {
    const attempt = database() as Promise<Database>;
    const failed = expect(attempt).rejects.toThrow(/timeout/);
    await server.stalled();
    await vi.advanceTimersByTimeAsync(wait);
    await failed;
    return { attempt };
  }

  it("rejects a connect that never answers, logs it, and tries again on the next call", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const server = await stalledAt("connect");
    const first = await timedOut(server, CONNECT_TIMEOUT_MS);
    expect(error).toHaveBeenCalledWith("squint db: connect failed (timeout)");
    expect((await timedOut(server, CONNECT_TIMEOUT_MS)).attempt).not.toBe(first.attempt);
    expect(server.connections).toBe(2);
  });

  it("rejects a query that never answers and tries again on the next call", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const server = await stalledAt("query");
    const first = await timedOut(server, QUERY_TIMEOUT_MS);
    expect((await timedOut(server, QUERY_TIMEOUT_MS)).attempt).not.toBe(first.attempt);
    expect(server.connections).toBe(2);
  });
});

describe("watchPool", () => {
  it("logs idle connection errors instead of throwing them", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pool = watchPool(new EventEmitter() as unknown as Pool, "db");
    expect(() => pool.emit("error", new Error("Connection terminated unexpectedly"))).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      "squint db: idle database connection closed (Connection terminated unexpectedly)",
    );
  });
});

/**
 * Cold starts racing on an empty database. Needs a real Postgres
 * (TEST_DATABASE_URL, local only); skipped otherwise.
 */
describe.skipIf(!TEST_DATABASE_URL)("migrateWithLock on Postgres, in parallel", () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const close of closers.splice(0)) await close();
  });

  it("applies every migration once when 5 runs start together on an empty schema", async () => {
    const fresh = await freshSchema(TEST_DATABASE_URL as string, 5);
    closers.push(() => fresh.close());
    const runs = await Promise.all(
      Array.from({ length: 5 }, () => migrateWithLock(fresh.pool, migrate)),
    );
    expect(runs.flat().sort()).toEqual(MIGRATIONS.map((migration) => migration.id));
    expect(runs.filter((ran) => ran.length > 0)).toHaveLength(1);
  });

  it("serializes Squint's and Pinpoint's migrations on the same lock", async () => {
    const fresh = await freshSchema(TEST_DATABASE_URL as string, 6);
    closers.push(() => fresh.close());
    const runs = await Promise.all([
      ...Array.from({ length: 3 }, () => migrateWithLock(fresh.pool, migrate)),
      ...Array.from({ length: 3 }, () => migrateWithLock(fresh.pool, migratePinpoint)),
    ]);
    expect(runs.flat()).toHaveLength(MIGRATIONS.length + PINPOINT_MIGRATIONS.length);
  });

  it("runs migrations under the local statement and lock timeouts", async () => {
    const fresh = await freshSchema(TEST_DATABASE_URL as string, 1);
    closers.push(() => fresh.close());
    const limits = await migrateWithLock(fresh.pool, async (client) => {
      const { rows } = await client.query<{ statement: string; lock: string }>(
        "SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock",
      );
      return rows[0];
    });
    expect(limits).toEqual({ statement: "20s", lock: "10s" });
    const { rows } = await fresh.pool.query<{ statement: string }>(
      "SELECT current_setting('statement_timeout') AS statement",
    );
    expect(rows[0]?.statement).toBe("0");
  });
});
