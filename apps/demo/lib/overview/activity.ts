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

export interface BusiestFolder {
  id: string;
  name: string;
  /** What made it the busiest: open comments, or, with none open anywhere, projects. */
  measure: "comments" | "projects";
  count: number;
  /** Its share of that measure across the workspace, 0 to 1. */
  share: number;
  /** That share in words' terms (`percentOf`): 100 only when it's all of it. */
  percent: number;
}

/** The folder with the highest count in `counts`; a tie goes to the older folder. */
function topFolder(data: SquintData, counts: ReadonlyMap<string, number>) {
  let top: { id: string; name: string; count: number } | null = null;
  const byAge = [...data.folders].sort((a, b) => a.createdAt - b.createdAt);
  for (const folder of byAge) {
    const count = counts.get(folder.id) ?? 0;
    if (count > (top?.count ?? 0)) top = { id: folder.id, name: folder.name, count };
  }
  return top;
}

/**
 * The folder holding the most open comments in its own projects (not its
 * subfolders'), as Squiggy's "waiting in" line picks it; with nothing open
 * anywhere, the one holding the most projects. Null without projects.
 */
export function busiestFolder(data: SquintData): BusiestFolder | null {
  const folderOf = new Map(data.projects.map((project) => [project.id, project.folderId]));
  const comments = new Map<string, number>();
  let open = 0;
  for (const comment of data.comments) {
    const folderId = folderOf.get(comment.projectId);
    if (folderId === undefined || comment.status !== "active") continue;
    open += 1;
    comments.set(folderId, (comments.get(folderId) ?? 0) + 1);
  }
  const byComments = topFolder(data, comments);
  if (byComments) {
    return {
      ...byComments,
      measure: "comments",
      share: byComments.count / open,
      percent: percentOf(byComments.count, open),
    };
  }
  const projects = new Map<string, number>();
  for (const project of data.projects) {
    projects.set(project.folderId, (projects.get(project.folderId) ?? 0) + 1);
  }
  const byProjects = topFolder(data, projects);
  return byProjects
    ? {
        ...byProjects,
        measure: "projects",
        share: byProjects.count / data.projects.length,
        percent: percentOf(byProjects.count, data.projects.length),
      }
    : null;
}
