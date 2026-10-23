import pg, { type QueryResult, type QueryResultRow } from "pg";
import {
  PinNotFoundError,
  type PinDraft,
  type ScreenshotStore,
  type StorageAdapter,
} from "../storage";
import type { Pin } from "../types";
import {
  GET_PIN,
  INSERT_PIN,
  INSERT_REPLY,
  LIST_PINS,
  RESOLVE_PIN,
  SET_SCREENSHOT_URL,
} from "./queries";
import { rowToPin, type PinRow } from "./rows";

/** The slice of `pg.Pool` the adapter uses; any compatible client works. */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

export interface PostgresStorageOptions {
  /** Existing pool or client. Takes precedence over `connectionString`. */
  pool?: Queryable;
  /** Usually `process.env.DATABASE_URL`. */
  connectionString?: string;
  /** Screenshot destination. Without one, a mirror's screenshot URL is adopted if available. */
  screenshots?: ScreenshotStore;
  /**
   * Second adapter that receives every write made through pinpoint (e.g.
   * GitHub). One-way and best-effort: failures are logged, never thrown.
   */
  mirror?: StorageAdapter;
}

/** Postgres storage. Run `migrations/001_init.sql` once before use. */
export function createPostgresStorage(options: PostgresStorageOptions): StorageAdapter {
  if (!options.pool && !options.connectionString) {
    throw new Error("createPostgresStorage needs a `pool` or a `connectionString`");
  }
  const pool: Queryable =
    options.pool ?? new pg.Pool({ connectionString: options.connectionString });
  const { screenshots, mirror } = options;

  async function mirrored<T>(label: string, write: (target: StorageAdapter) => Promise<T>) {
    if (!mirror) return null;
    try {
      return await write(mirror);
    } catch (error) {
      console.error(`[pinpoint] Mirror ${label} failed; the primary write succeeded.`, error);
      return null;
    }
  }

  async function getPin(branch: string, pinId: string): Promise<Pin> {
    const { rows } = await pool.query<PinRow>(GET_PIN, [branch, pinId]);
    const row = rows[0];
    if (!row) throw new PinNotFoundError(pinId);
    return rowToPin(row);
  }

  return {
    async listPins({ branch, path }) {
      const { rows } = await pool.query<PinRow>(LIST_PINS, [branch, path]);
      return rows.map(rowToPin);
    },

    async createPin(draft: PinDraft) {
      const { screenshot, ...fields } = draft;
      const ownUrl =
        screenshot && screenshots
          ? await screenshots.save({ branch: fields.branch, pinId: fields.id, screenshot })
          : null;
      await pool.query(INSERT_PIN, [
        fields.id,
        fields.branch,
        fields.path,
        fields.deploymentUrl,
        fields.deepLink,
        JSON.stringify(fields.anchor),
        fields.author,
        fields.body,
        fields.priority,
        ownUrl,
        JSON.stringify(fields.context),
        fields.createdAt,
      ]);

      const copy = await mirrored("createPin", (target) => target.createPin(draft));
      const adoptedUrl = ownUrl ?? copy?.screenshotUrl ?? null;
      if (!ownUrl && adoptedUrl) await pool.query(SET_SCREENSHOT_URL, [fields.id, adoptedUrl]);
      return { ...fields, screenshotUrl: adoptedUrl };
    },

    async addReply(params) {
      const { branch, pinId, reply } = params;
      const { rowCount } = await pool.query(INSERT_REPLY, [
        reply.id,
        pinId,
        reply.author,
        reply.body,
        reply.createdAt,
        branch,
      ]);
      if (!rowCount) throw new PinNotFoundError(pinId);
      await mirrored("addReply", (target) => target.addReply(params));
      return getPin(branch, pinId);
    },

    async resolvePin(params) {
      const { branch, pinId, resolvedAt, resolvedBy } = params;
      const { rowCount } = await pool.query(RESOLVE_PIN, [pinId, branch, resolvedAt, resolvedBy]);
      if (!rowCount) throw new PinNotFoundError(pinId);
      await mirrored("resolvePin", (target) => target.resolvePin(params));
      return getPin(branch, pinId);
    },
  };
}
