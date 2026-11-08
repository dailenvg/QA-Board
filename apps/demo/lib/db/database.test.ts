import { EventEmitter } from "node:events";
import {
  migrate as migratePinpoint,
  MIGRATIONS as PINPOINT_MIGRATIONS,
} from "@pinpoint/server/postgres";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { freshSchema, TEST_DATABASE_URL } from "@/test/postgres";
import { MIGRATIONS, migrate } from "../share/migrate";
import { migrateWithLock, poolDatabase, watchPool } from "./database";

/** A pool whose one client fails the queries named in `failing`. */
function fakePool(failing: string[]) {
  const release = vi.fn();
  const client = {
    query: vi.fn((sql: string) =>
      failing.includes(sql) ? Promise.reject(new Error(sql)) : Promise.resolve({ rows: [] }),
    ),
    release,
  };
  const pool = { connect: () => Promise.resolve(client), query: vi.fn() } as unknown as Pool;
  return { pool, release };
}

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
});
