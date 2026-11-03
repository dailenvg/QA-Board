import { PGlite } from "@electric-sql/pglite";
import { migrate, type Queryable } from "@/lib/share/migrate";

/**
 * PGlite is Postgres compiled to WebAssembly: the real SQL, no server. Like
 * `pg`, parameterless queries use the simple protocol (several statements allowed).
 */
export function adaptPglite(db: PGlite): Queryable {
  return {
    async query<Row>(text: string, params?: unknown[]) {
      if (params?.length) return db.query<Row>(text, params);
      const results = await db.exec(text);
      return { rows: (results.at(-1)?.rows ?? []) as Row[] };
    },
  };
}

/** A fresh in-memory database with every migration applied. */
export async function migratedPglite(): Promise<Queryable> {
  const db = adaptPglite(new PGlite());
  await migrate(db);
  return db;
}
