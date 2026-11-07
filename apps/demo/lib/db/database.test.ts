import { EventEmitter } from "node:events";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { poolDatabase, watchPool } from "./database";

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
