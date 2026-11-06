import { PGlite, type Transaction } from "@electric-sql/pglite";
import type { Database } from "@/lib/db/database";
import { migrate, type Queryable } from "@/lib/share/migrate";

type Runner = Pick<PGlite, "query" | "exec"> | Transaction;

function queryable(db: Runner): Queryable {
  return {
    // Like `pg`, parameterless queries use the simple protocol (several statements allowed).
    async query<Row>(text: string, params?: unknown[]) {
      if (params?.length) return db.query<Row>(text, params);
      const results = await db.exec(text);
      return { rows: (results.at(-1)?.rows ?? []) as Row[] };
    },
  };
}

/**
 * PGlite is Postgres compiled to WebAssembly: the real SQL, no server. It has
 * one connection, so its transactions run one at a time.
 */
export function adaptPglite(db: PGlite): Database {
  return {
    ...queryable(db),
    transaction: (run) => db.transaction((tx) => run(queryable(tx))),
  };
}

/** A fresh in-memory database with every migration applied. */
export async function migratedPglite(): Promise<Database> {
  const db = adaptPglite(new PGlite());
  await migrate(db);
  return db;
}
