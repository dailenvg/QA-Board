import type { PostgresPool, PostgresPoolClient, PostgresQueryResult } from "kysely";
import type { Queryable } from "../share/migrate";
import type { Database } from "./database";

/**
 * `db` as the `pg`-style pool Kysely's Postgres dialect drives (Better Auth
 * talks to Postgres through it). Plain queries go to `db.query`; BEGIN to
 * COMMIT or ROLLBACK on one client becomes one `db.transaction`. So Better
 * Auth shares the app's pool, its timeouts and its rollback handling, and in
 * tests PGlite's single connection, with no second pool to open or close.
 */
export function databasePool(db: Database): PostgresPool {
  return {
    connect: () => Promise.resolve(databaseClient(db)),
    // The app's pool outlives any one Better Auth instance: never end it from here.
    end: () => Promise.resolve(),
  };
}

type Command = PostgresQueryResult<unknown>["command"];

/** What `pg` and PGlite answer besides the rows; each has its own name for the count. */
interface RawResult<Row> {
  rows: Row[];
  command?: string;
  rowCount?: number | null;
  affectedRows?: number;
}

/** The statement's first word, upper-cased: `begin`, `insert`, `commit`. */
function verbOf(sql: string): string {
  return sql.trimStart().split(/\s/, 1)[0]?.toUpperCase() ?? "";
}

function resultOf<Row>(sql: string, raw: RawResult<Row>): PostgresQueryResult<Row> {
  return {
    command: (raw.command ?? verbOf(sql)) as Command,
    rowCount: raw.rowCount ?? raw.affectedRows ?? raw.rows.length,
    rows: raw.rows,
  };
}

interface OpenTransaction {
  tx: Queryable;
  end(outcome: "commit" | "rollback"): Promise<void>;
}

/**
 * Opens a `db.transaction` and holds it open until `end`: commit lets it
 * finish, rollback makes it throw (and roll back), and either way `end`
 * waits for it and passes on any failure but the rollback asked for.
 */
function openTransaction(db: Database): Promise<OpenTransaction> {
  // Thrown to roll back, and known by identity so it's swallowed and nothing else is.
  const rollback = new Error("rollback asked for");
  return new Promise((opened, failed) => {
    let settle: (outcome: "commit" | "rollback") => void = () => undefined;
    const outcome = new Promise<"commit" | "rollback">((resolve) => {
      settle = resolve;
    });
    const done = db.transaction(async (tx) => {
      opened({ tx, end });
      if ((await outcome) === "rollback") throw rollback;
    });
    done.catch(failed);
    async function end(next: "commit" | "rollback"): Promise<void> {
      settle(next);
      await done.catch((error: unknown) => {
        if (error !== rollback) throw error;
      });
    }
  });
}

/** One client: outside a transaction a window onto `db`, inside one its transaction. */
function databaseClient(db: Database): PostgresPoolClient {
  let open: OpenTransaction | null = null;

  async function query<Row>(sql: string, parameters: ReadonlyArray<unknown>) {
    const verb = verbOf(sql);
    if (verb === "BEGIN" || verb === "START") {
      open = await openTransaction(db);
      // `start transaction isolation level …`: the same settings, inside the BEGIN just run.
      const settings = sql.replace(/^\s*start\s+transaction/i, "").trim();
      if (verb === "START" && settings) await open.tx.query(`SET TRANSACTION ${settings}`);
      return resultOf<Row>(sql, { rows: [], command: "BEGIN" });
    }
    if ((verb === "COMMIT" || verb === "ROLLBACK") && open) {
      const ending = open;
      open = null;
      await ending.end(verb === "COMMIT" ? "commit" : "rollback");
      return resultOf<Row>(sql, { rows: [], command: verb });
    }
    const target: Queryable = open?.tx ?? db;
    const raw = (await target.query<Row>(sql, [...parameters])) as RawResult<Row>;
    return resultOf(sql, raw);
  }

  return {
    query: query as PostgresPoolClient["query"],
    release() {
      // Kysely ends its transactions before releasing; a client let go mid-way rolls back.
      void open?.end("rollback").catch(() => undefined);
      open = null;
    },
  };
}
