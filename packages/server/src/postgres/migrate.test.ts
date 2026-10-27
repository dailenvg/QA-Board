import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import { migrate, MIGRATIONS } from "./migrate";
import type { Queryable } from "./postgres-storage";

function poolWith(applied: string[]) {
  const query = vi.fn((text: string) =>
    Promise.resolve({
      rows: text.startsWith("SELECT id FROM pinpoint_migrations")
        ? applied.map((id) => ({ id }))
        : [],
      rowCount: 0,
      command: "",
      oid: 0,
      fields: [],
    } as QueryResult<QueryResultRow>),
  );
  return { pool: { query } as unknown as Queryable, query };
}

describe("migrate", () => {
  it("creates the ledger and applies pending migrations in order", async () => {
    const { pool, query } = poolWith([]);
    await expect(migrate(pool)).resolves.toEqual(["001_init", "002_pins_created_at"]);

    const statements = query.mock.calls.map(([text]) => text);
    expect(statements[0]).toContain("CREATE TABLE IF NOT EXISTS pinpoint_migrations");
    expect(statements[2]).toContain("CREATE TABLE IF NOT EXISTS pinpoint_pins");
    expect(statements[4]).toContain("pinpoint_pins_created_at_idx");
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("INSERT INTO pinpoint_migrations"),
      ["002_pins_created_at"],
    );
  });

  it("skips migrations that were already applied", async () => {
    const { pool, query } = poolWith(MIGRATIONS.map((m) => m.id));
    await expect(migrate(pool)).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
