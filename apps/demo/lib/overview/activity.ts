import type { Comment, Project, SquintData } from "../store/types";
import type { ClientCommentActivity } from "../workspace/types";

/**
 * What the Overview's tiles show, worked out from the workspace. Pure: no
 * React, no clock (callers pass the last visit's time). Comment counts are
 * the workspace's own comments, as on every card, folder page and Squiggy's
 * line, so the numbers agree across the app; clients' comments still waiting
 * on a review link only count where the Overview talks about clients.
 */

/**
 * Rows each list tile can show: where the bento fits one screen, as many as
 * fit; elsewhere `natural`. Past them, a "+N more" link stands for the rest.
 */
export const LIST_ROWS = {
  waiting: { most: 6, natural: 3 },
  recent: { most: 6, natural: 4 },
  clients: { most: 6, natural: 3 },
  leaving: { most: 6, natural: 2 },
} as const;

/** Whether something at `at` came after the last visit. Nothing is new until that's known. */
export function isNewSince(at: number, since: number | null): boolean {
  return since !== null && at > since;
}

function projectsById(data: SquintData): Map<string, Project> {
  return new Map(data.projects.map((project) => [project.id, project]));
}

/** Comments on projects the workspace has (a comment never outlives its project for long). */
function placedComments(data: SquintData): Comment[] {
  const ids = new Set(data.projects.map((project) => project.id));
  return data.comments.filter((comment) => ids.has(comment.projectId));
}

export interface CommentTotals {
  open: number;
  resolved: number;
}

/**
 * `part` of `whole` as a whole percentage that never overstates: 100 only when
 * it's all, 0 only when it's none (199 of 200 reads 99%, 1 of 200 reads 1%).
 * 0 when `whole` is.
 */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0 || part <= 0) return 0;
  if (part >= whole) return 100;
  return Math.min(99, Math.max(1, Math.round((part / whole) * 100)));
}

/** How much of the feedback is resolved, as `percentOf` reads it. */
export function resolvedPercent({ open, resolved }: CommentTotals): number {
  return percentOf(resolved, open + resolved);
}

export function commentTotals(data: SquintData): CommentTotals {
  let open = 0;
  let resolved = 0;
  for (const comment of placedComments(data)) {
    if (comment.status === "active") open += 1;
    else resolved += 1;
  }
  return { open, resolved };
}

export interface WaitingComment {
  id: string;
  projectId: string;
  projectName: string;
  body: string;
  author: string;
  createdAt: number;
  fromClient: boolean;
}

/** The open comments that have waited longest, oldest first. */
export function oldestOpen(
  data: SquintData,
  limit: number = LIST_ROWS.waiting.most,
): WaitingComment[] {
  const projects = projectsById(data);
  return placedComments(data)
    .filter((comment) => comment.status === "active")
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((comment) => ({
      id: comment.id,
      projectId: comment.projectId,
      projectName: projects.get(comment.projectId)?.name ?? "",
      body: comment.body,
      author: comment.author,
      createdAt: comment.createdAt,
      fromClient: comment.fromClient === true,
    }));
}

export interface RecentProject {
  id: string;
  name: string;
  /** Null when its folder isn't loaded (a project the store hasn't filed yet). */
  folderName: string | null;
  updatedAt: number;
  open: number;
  /** Changed since the last visit. */
  isNew: boolean;
}

/** The most recently updated projects, newest first. */
export function recentProjects(
  data: SquintData,
  since: number | null,
  limit: number = LIST_ROWS.recent.most,
): RecentProject[] {
  const folders = new Map(data.folders.map((folder) => [folder.id, folder.name]));
  const open = new Map<string, number>();
  for (const comment of data.comments) {
    if (comment.status === "active") {
      open.set(comment.projectId, (open.get(comment.projectId) ?? 0) + 1);
    }
  }
  return [...data.projects]
    .sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((project) => ({
      id: project.id,
      name: project.name,
      folderName: folders.get(project.folderId) ?? null,
      updatedAt: project.updatedAt,
      open: open.get(project.id) ?? 0,
      isNew: isNewSince(project.updatedAt, since),
    }));
}

export interface ClientProjectNews {
  projectId: string;
  projectName: string;
  /** Client comments posted since the last visit, pulled or still on the review link. */
  count: number;
  latestAt: number;
}

export interface ClientNews {
  total: number;
  /** Of `total`, those still on review links: opening the project brings them in. */
  waiting: number;
  /** Each project with news, the newest first (`rows.length` of them in all). */
  rows: ClientProjectNews[];
}

/**
 * Client comments posted since `since`: those pulled into the workspace
 * (`fromClient`) and those still waiting on a review link (`activity`). A
 * project pulled since the server's read (its cursor moved past the read's)
 * has its waiting comments in `data` now, so they aren't counted again.
 */
export function newFromClients(
  data: SquintData,
  activity: readonly ClientCommentActivity[],
  since: number,
): ClientNews {
  const projects = projectsById(data);
  const news = new Map<string, ClientProjectNews>();
  let waiting = 0;
  const add = (project: Project, count: number, latestAt: number) => {
    const found = news.get(project.id);
    if (found) {
      found.count += count;
      found.latestAt = Math.max(found.latestAt, latestAt);
    } else {
      news.set(project.id, { projectId: project.id, projectName: project.name, count, latestAt });
    }
  };
  for (const comment of data.comments) {
    const project = projects.get(comment.projectId);
    if (project && comment.fromClient && comment.createdAt > since) {
      add(project, 1, comment.createdAt);
    }
  }
  for (const entry of activity) {
    const project = projects.get(entry.projectId);
    if (!project || (project.share?.cursor ?? 0) > entry.cursor) continue;
    const fresh = entry.waiting.filter((at) => at > since);
    if (fresh.length === 0) continue;
    waiting += fresh.length;
    add(project, fresh.length, Math.max(...fresh));
  }
  const rows = [...news.values()].sort(
    (a, b) => b.latestAt - a.latestAt || a.projectName.localeCompare(b.projectName),
  );
  return {
    total: rows.reduce((sum, row) => sum + row.count, 0),
    waiting,
    rows,
  };
}

export interface LeavingProject {
  id: string;
  name: string;
  /** Null when its folder isn't loaded (a project the store hasn't filed yet). */
  folderName: string | null;
  archivedAt: number;
  /** When the daily cron deletes it for good (epoch ms). */
  deleteAfter: number;
}

/**
 * The archived projects, the one deleted for good soonest first. Pass the
 * whole workspace (`allData`): `activeData` has already left them out.
 */
export function leavingSoon(
  data: SquintData,
  limit: number = LIST_ROWS.leaving.most,
): LeavingProject[] {
  const folders = new Map(data.folders.map((folder) => [folder.id, folder.name]));
  const leaving: LeavingProject[] = [];
  for (const project of data.projects) {
    if (project.archivedAt === undefined || project.deleteAfter === undefined) continue;
    leaving.push({
      id: project.id,
      name: project.name,
      folderName: folders.get(project.folderId) ?? null,
      archivedAt: project.archivedAt,
      deleteAfter: project.deleteAfter,
    });
  }
  return leaving
    .sort((a, b) => a.deleteAfter - b.deleteAfter || a.name.localeCompare(b.name))
    .slice(0, limit);
}
