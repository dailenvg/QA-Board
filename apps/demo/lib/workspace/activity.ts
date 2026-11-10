import type { Queryable } from "../share/migrate";
import { toMs } from "./times";
import type { ClientCommentActivity } from "./types";

/**
 * Clients' comments across the workspace's live projects, for the Overview.
 * A client's comment is either pulled into the workspace already (a comment
 * whose origin is 'client') or still waiting on the project's review link: a
 * client row of the link's share past the owner's pull cursor that isn't in
 * `comments` yet (another tab may have saved it before moving the cursor).
 * A comment is counted in one place only, never in both. A share that has
 * expired is gone (`isExpired`: the owner can't pull it any more, even before
 * the cron deletes it), so nothing waits on it.
 */

interface PulledRow {
  project_id: string;
  open: number;
  latest_at: Date;
}

interface WaitingRow {
  project_id: string;
  cursor: string | number;
  latest_at: string | number;
  waiting: Array<string | number>;
}

async function pulledRows(db: Queryable, workspaceId: string): Promise<PulledRow[]> {
  const { rows } = await db.query<PulledRow>(
    `SELECT comment.project_id,
       count(*) FILTER (WHERE comment.status = 'active')::int AS open,
       max(comment.created_at) AS latest_at
     FROM comments AS comment
     JOIN projects AS project ON project.id = comment.project_id
     WHERE project.workspace_id = $1 AND project.deleted_at IS NULL
       AND comment.origin = 'client'
     GROUP BY comment.project_id`,
    [workspaceId],
  );
  return rows;
}

async function waitingRows(db: Queryable, workspaceId: string, now: number): Promise<WaitingRow[]> {
  const { rows } = await db.query<WaitingRow>(
    `SELECT link.project_id, link.cursor,
       max((item.data->>'createdAt')::bigint) AS latest_at,
       coalesce(
         array_agg((item.data->>'createdAt')::bigint ORDER BY (item.data->>'createdAt')::bigint DESC)
           FILTER (WHERE item.data->>'status' = 'active'),
         '{}'
       ) AS waiting
     FROM project_share_links AS link
     JOIN projects AS project
       ON project.workspace_id = link.workspace_id AND project.id = link.project_id
     JOIN squint_shares AS share ON share.id = link.share_id
     JOIN squint_share_comments AS item ON item.share_id = link.share_id
     WHERE link.workspace_id = $1 AND project.deleted_at IS NULL
       AND (share.expires_at IS NULL OR share.expires_at > $2)
       AND item.origin = 'client' AND NOT item.pending AND item.seq > link.cursor
       AND NOT EXISTS (
         SELECT 1 FROM comments AS saved
         WHERE saved.project_id = link.project_id AND saved.id = item.id
       )
     GROUP BY link.project_id, link.cursor`,
    [workspaceId, now],
  );
  return rows;
}

/** Every live project with a client comment at `now`, newest client comment first. */
export async function clientActivity(
  db: Queryable,
  workspaceId: string,
  now: number = Date.now(),
): Promise<ClientCommentActivity[]> {
  const [pulled, waiting] = await Promise.all([
    pulledRows(db, workspaceId),
    waitingRows(db, workspaceId, now),
  ]);
  const byProject = new Map<string, ClientCommentActivity>();
  const entry = (projectId: string) => {
    let found = byProject.get(projectId);
    if (!found) {
      found = { projectId, open: 0, latestAt: 0, waiting: [], cursor: 0 };
      byProject.set(projectId, found);
    }
    return found;
  };
  for (const row of pulled) {
    const found = entry(row.project_id);
    found.open += row.open;
    found.latestAt = Math.max(found.latestAt, toMs(row.latest_at));
  }
  for (const row of waiting) {
    const found = entry(row.project_id);
    found.waiting = row.waiting.map(Number);
    found.open += found.waiting.length;
    found.latestAt = Math.max(found.latestAt, Number(row.latest_at));
    found.cursor = Number(row.cursor);
  }
  return [...byProject.values()].sort(
    (a, b) => b.latestAt - a.latestAt || a.projectId.localeCompare(b.projectId),
  );
}
