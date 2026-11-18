import { z } from "zod";
import type { Queryable } from "../share/migrate";
import { single, type SearchParams } from "../search-params";
import { toMs } from "../workspace/times";
import { auditDetails, type AuditDetails } from "./audit-details";
import { SQUINT_ACTOR, type AuditFilters } from "./audit-href";

/**
 * The admin panel's audit log: newest first, filtered by workspace, actor
 * and action, a page at a time. Pages are keyset pages on `(at, id)`, so an
 * entry recorded while someone reads never shifts or repeats a page. The
 * filters and the cursor live in the URL, so any view of it is a link.
 */

export const AUDIT_PAGE_SIZE = 50;

/**
 * A page boundary: an entry's time in microseconds since the epoch (the
 * column's own precision, so no entry is skipped or repeated) and its id.
 */
export interface AuditCursor {
  micros: string;
  id: string;
}

export interface AuditParams extends AuditFilters {
  /** Entries older than this. */
  before?: AuditCursor;
  /** Entries newer than this (ignored alongside `before`). */
  after?: AuditCursor;
}

/** Both parts fit a bigint: 18 digits at most. */
const CURSOR = /^(\d{1,18})-(\d{1,18})$/;
/** "user.name_changed", "seed.user_created". */
const ACTION = /^[a-z][a-z_]{0,40}\.[a-z][a-z_]{0,40}$/;

const cursorSchema = z
  .string()
  .regex(CURSOR)
  .transform((value): AuditCursor => {
    const [, micros = "0", id = "0"] = CURSOR.exec(value) ?? [];
    return { micros, id };
  });

/** Every parameter read on its own: a bad one is dropped (no filter, the first page), never an error. */
const paramsSchema = z.object({
  workspace: z.guid().optional().catch(undefined),
  actor: z
    .union([z.literal(SQUINT_ACTOR), z.guid()])
    .optional()
    .catch(undefined),
  action: z.string().regex(ACTION).optional().catch(undefined),
  before: cursorSchema.optional().catch(undefined),
  after: cursorSchema.optional().catch(undefined),
});

/** The audit log's view from a page's `searchParams`. */
export function parseAuditParams(search: SearchParams): AuditParams {
  const { workspace, actor, action, before, after } = paramsSchema.parse({
    workspace: single(search.workspace)?.toLowerCase(),
    actor: single(search.actor)?.toLowerCase(),
    action: single(search.action),
    before: single(search.before),
    after: single(search.after),
  });
  return {
    ...(workspace ? { workspace } : {}),
    ...(actor ? { actor } : {}),
    ...(action ? { action } : {}),
    ...(before ? { before } : after ? { after } : {}),
  };
}

export function formatCursor({ micros, id }: AuditCursor): string {
  return `${micros}-${id}`;
}

/** One entry, as the admin panel shows it. */
export interface AuditRow {
  id: string;
  /** Epoch ms. */
  at: number;
  cursor: string;
  action: string;
  /** Null for Squint itself. */
  actor: { id: string; email: string; name: string | null; deleted: boolean } | null;
  /** Null for an entry outside any workspace (an account's own change). */
  workspace: { id: string; name: string | null } | null;
  target: { type: string; id: string; label: string | null } | null;
  details: AuditDetails;
}

export interface AuditPage {
  entries: AuditRow[];
  /** The cursor for the next page back in time, or null on the oldest. */
  older: string | null;
  /** The cursor for the page before this one, or null on the newest. */
  newer: string | null;
}

interface EntryRow {
  id: string;
  at: Date | string;
  at_micros: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  meta: unknown;
  workspace_id: string | null;
  workspace_name: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  actor_deleted: boolean | null;
  target_label: string | null;
}

/**
 * The filters and one side of the cursor as SQL, from parameter `$1` on:
 * workspace, actor (a user, or Squint), action, and the cursor's micros and id.
 */
function pageQuery(params: AuditParams, newer: boolean): { sql: string; values: unknown[] } {
  const cursor = newer ? params.after : params.before;
  const squint = params.actor === SQUINT_ACTOR;
  const values = [
    params.workspace ?? null,
    squint ? null : (params.actor ?? null),
    squint,
    params.action ?? null,
    cursor?.micros ?? null,
    cursor?.id ?? null,
    AUDIT_PAGE_SIZE + 1,
  ];
  const sql = `
    SELECT id, at, (extract(epoch FROM at) * 1000000)::bigint::text AS at_micros, action,
      target_type, target_id, meta, workspace_id, actor_user_id
    FROM audit_log
    WHERE ($1::uuid IS NULL OR workspace_id = $1::uuid)
      AND ($2::uuid IS NULL OR actor_user_id = $2::uuid)
      AND (NOT $3::boolean OR actor_user_id IS NULL)
      AND ($4::text IS NULL OR action = $4::text)
      AND ($5::bigint IS NULL OR (at, id) ${newer ? ">" : "<"}
        ('epoch'::timestamptz + $5::bigint * interval '1 microsecond', $6::bigint))
    ORDER BY at ${newer ? "ASC" : "DESC"}, id ${newer ? "ASC" : "DESC"}
    LIMIT $7`;
  return { sql, values };
}

/** The page's entries with who, where and what they name, read only for the page's rows. */
async function readPage(db: Queryable, params: AuditParams, newer: boolean): Promise<EntryRow[]> {
  const { sql, values } = pageQuery(params, newer);
  const { rows } = await db.query<EntryRow>(
    `WITH page AS (${sql})
     SELECT page.id::text AS id, page.at, page.at_micros, page.action, page.target_type,
       page.target_id, page.meta, page.workspace_id::text AS workspace_id,
       workspace.name AS workspace_name, page.actor_user_id::text AS actor_id,
       actor.email AS actor_email, actor.name AS actor_name,
       actor.deleted_at IS NOT NULL AS actor_deleted,
       CASE page.target_type
         WHEN 'user' THEN target_user.email
         WHEN 'workspace' THEN target_workspace.name
         WHEN 'project' THEN target_project.name
       END AS target_label
     FROM page
     LEFT JOIN users AS actor ON actor.id = page.actor_user_id
     LEFT JOIN workspaces AS workspace ON workspace.id = page.workspace_id
     LEFT JOIN users AS target_user
       ON page.target_type = 'user' AND target_user.id::text = page.target_id
     LEFT JOIN workspaces AS target_workspace
       ON page.target_type = 'workspace' AND target_workspace.id::text = page.target_id
     LEFT JOIN projects AS target_project
       ON page.target_type = 'project' AND target_project.id = page.target_id
     ORDER BY page.at ${newer ? "ASC" : "DESC"}, page.id ${newer ? "ASC" : "DESC"}`,
    values,
  );
  return rows;
}

function toAuditRow(row: EntryRow): AuditRow {
  return {
    id: row.id,
    at: toMs(row.at),
    cursor: formatCursor({ micros: row.at_micros, id: row.id }),
    action: row.action,
    actor:
      row.actor_id && row.actor_email
        ? {
            id: row.actor_id,
            email: row.actor_email,
            name: row.actor_name,
            deleted: row.actor_deleted ?? false,
          }
        : null,
    workspace: row.workspace_id ? { id: row.workspace_id, name: row.workspace_name } : null,
    target:
      row.target_type && row.target_id
        ? { type: row.target_type, id: row.target_id, label: row.target_label }
        : null,
    details: auditDetails(row.meta),
  };
}

/**
 * One page of the log, newest first. Paging back (`before`) or forward
 * (`after`) from a cursor; a cursor always came from an entry on the other
 * side, so the way back is offered whenever one was given. An empty page
 * offers neither: the newest page is the way out.
 */
export async function loadAuditPage(db: Queryable, params: AuditParams): Promise<AuditPage> {
  const newer = !params.before && Boolean(params.after);
  const rows = await readPage(db, params, newer);
  const more = rows.length > AUDIT_PAGE_SIZE;
  const kept = rows.slice(0, AUDIT_PAGE_SIZE);
  const entries = (newer ? kept.reverse() : kept).map(toAuditRow);
  const first = entries[0]?.cursor ?? null;
  const last = entries.at(-1)?.cursor ?? null;
  return newer
    ? { entries, newer: more ? first : null, older: last }
    : { entries, newer: params.before ? first : null, older: more ? last : null };
}

/** What the filters offer. */
export interface AuditFilterOptions {
  /** Every workspace, then any the log names that has since been deleted (name null). */
  workspaces: Array<{ id: string; name: string | null }>;
  /** Every user who has done something on record. */
  actors: Array<{ id: string; email: string; name: string | null }>;
  /** Whether Squint itself has done anything on record. */
  squint: boolean;
  /** Every action on record, alphabetically. */
  actions: string[];
}

export async function loadAuditFilterOptions(db: Queryable): Promise<AuditFilterOptions> {
  const [workspaces, actors, squint, actions] = await Promise.all([
    db.query<{ id: string; name: string | null }>(
      `SELECT id::text AS id, name FROM workspaces
       UNION ALL
       SELECT DISTINCT log.workspace_id::text, NULL FROM audit_log AS log
       WHERE log.workspace_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM workspaces AS w WHERE w.id = log.workspace_id)
       ORDER BY name NULLS LAST, id`,
    ),
    db.query<{ id: string; email: string; name: string | null }>(
      `SELECT id::text AS id, email, name FROM users AS u
       WHERE EXISTS (SELECT 1 FROM audit_log AS log WHERE log.actor_user_id = u.id)
       ORDER BY email`,
    ),
    db.query<{ found: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM audit_log WHERE actor_user_id IS NULL) AS found",
    ),
    db.query<{ action: string }>("SELECT DISTINCT action FROM audit_log ORDER BY action"),
  ]);
  return {
    workspaces: workspaces.rows,
    actors: actors.rows,
    squint: squint.rows[0]?.found ?? false,
    actions: actions.rows.map((row) => row.action),
  };
}
