import type { Queryable } from "../share/migrate";
import type { Page } from "../store/types";
import type { PageInput } from "./schemas";

/** Pages are read and written through their project, so only the workspace's own are reachable. */

interface PageRow {
  project_id: string;
  id: string;
  blob_key: string;
  name: string;
  width: number | null;
  height: number | null;
  rev: number;
}

function toPage(row: PageRow): Page {
  return {
    id: row.id,
    blobKey: row.blob_key,
    name: row.name,
    ...(row.width !== null && row.height !== null ? { width: row.width, height: row.height } : {}),
    ...(row.rev > 0 ? { rev: row.rev } : {}),
  };
}

/** The pages of the workspace's projects `projectIds`, in reading order, by project id. */
export async function pagesByProject(
  db: Queryable,
  workspaceId: string,
  projectIds: readonly string[],
): Promise<Map<string, Page[]>> {
  const { rows } = await db.query<PageRow>(
    `SELECT page.project_id, page.id, page.blob_key, page.name, page.width, page.height, page.rev
     FROM pages AS page
     JOIN projects AS project ON project.id = page.project_id
     WHERE project.workspace_id = $1 AND project.id = ANY($2)
     ORDER BY page.project_id, page.position`,
    [workspaceId, [...projectIds]],
  );
  const byProject = new Map<string, Page[]>();
  for (const row of rows) {
    const pages = byProject.get(row.project_id) ?? [];
    pages.push(toPage(row));
    byProject.set(row.project_id, pages);
  }
  return byProject;
}

/**
 * Makes `pages` the project's pages, in that order: listed ones are added or
 * updated, the rest deleted (with the comments on them, as in the browser).
 * Run inside a transaction: positions are only checked at commit, so pages can
 * swap places. The caller has checked the project is the workspace's.
 */
export async function replacePages(
  tx: Queryable,
  workspaceId: string,
  projectId: string,
  pages: readonly PageInput[],
): Promise<void> {
  await tx.query(
    `DELETE FROM pages AS page USING projects AS project
     WHERE project.id = page.project_id AND project.workspace_id = $1
       AND page.project_id = $2 AND NOT (page.id = ANY($3))`,
    [workspaceId, projectId, pages.map((page) => page.id)],
  );
  for (const [position, page] of pages.entries()) {
    await tx.query(
      `INSERT INTO pages (project_id, id, blob_key, name, width, height, rev, position)
       SELECT project.id, $3, $4, $5, $6, $7, $8, $9 FROM projects AS project
       WHERE project.workspace_id = $1 AND project.id = $2
       ON CONFLICT (project_id, id) DO UPDATE SET blob_key = EXCLUDED.blob_key,
         name = EXCLUDED.name, width = EXCLUDED.width, height = EXCLUDED.height,
         rev = EXCLUDED.rev, position = EXCLUDED.position`,
      [
        workspaceId,
        projectId,
        page.id,
        page.blobKey,
        page.name,
        page.width ?? null,
        page.height ?? null,
        page.rev ?? 0,
        position,
      ],
    );
  }
}
