import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { adaptPglite } from "@/test/pglite";
import { MIGRATIONS, migrate } from "./migrate";

describe("migrate on PGlite", () => {
  it("applies every migration, then nothing the second time", async () => {
    const db = adaptPglite(new PGlite());
    expect(await migrate(db)).toEqual(MIGRATIONS.map((migration) => migration.id));
    expect(await migrate(db)).toEqual([]);
  });
});
