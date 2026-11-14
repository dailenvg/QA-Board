import { audit } from "../../account/audit";
import { authOrigin } from "../../auth/auth-url";
import { describeError } from "../../auth/http";
import { createRateLimiter } from "../../capture/rate-limit";
import type { Database } from "../../db/database";
import { projectHref } from "../../routes";
import type { Queryable } from "../../share/migrate";
import { ClickUpError, type Fetch } from "./api";
import { postClickUpMessage } from "./chat-api";
import { openClickUpConnection, type OpenedClickUpConnection } from "./connection-token";
import type { ClickUpActor } from "./connections";
import { clickUpMessage } from "./message";
import type { ClickUpSendInput } from "./schemas";

/**
 * "Send to ClickUp" on the server: the member's channels and ClickUp people,
 * read with their own token, and posting a project to a channel as them.
 * The token stays here; the browser gets names and ids only. Each send is
 * audited without its message.
 */

/** Why ClickUp couldn't be used. */
export type ClickUpRefusal =
  /** The member has no ClickUp connection in this workspace. */
  | "not-connected"
  /** ClickUp refused their token (or it can't be opened): they connect again. Posting, a 401 only. */
  | "reconnect"
  /** Squint's brake, or ClickUp's own. */
  | "rate-limited"
  /** ClickUp didn't answer, or not as expected. */
  | "unreachable";

export type ClickUpRefused = { ok: false; reason: ClickUpRefusal; retryAfterSeconds?: number };

/** A ClickUp 429 says nothing Squint keeps: try again after a minute. */
const CLICKUP_RETRY_SECONDS = 60;

/** Sends per member: each is a message in someone's ClickUp. Per server instance. */
const sends = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });

/** List reads per member (channels and people together): each one asks ClickUp. */
const reads = createRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 });

export interface ClickUpServices {
  apiUrl: string;
  fetcher?: Fetch;
  /** `AUTH_SECRET` unless a test passes its own. */
  secret?: string;
}

/** What a failed ClickUp call means for the member; unexpected ones are logged by kind. */
function refusalOf(error: unknown, what: string): ClickUpRefused {
  if (error instanceof ClickUpError && error.refused) return { ok: false, reason: "reconnect" };
  if (error instanceof ClickUpError && error.status === 429) {
    return { ok: false, reason: "rate-limited", retryAfterSeconds: CLICKUP_RETRY_SECONDS };
  }
  console.error(`squint clickup: ${what} failed (${describeError(error)})`);
  return { ok: false, reason: "unreachable" };
}

/** The actor's opened connection, or why there's none to use. */
async function connectionOf(
  db: Database,
  actor: ClickUpActor,
  secret?: string,
): Promise<OpenedClickUpConnection | ClickUpRefused> {
  const read = await openClickUpConnection(db, actor, secret);
  if (read === null) return { ok: false, reason: "not-connected" };
  if (read === "unreadable") return { ok: false, reason: "reconnect" };
  return read;
}

/** Reads a list from the member's ClickUp workspace: `listClickUpChannels` or `listClickUpPeople`. */
export type ClickUpListRead<T> = (
  apiUrl: string,
  token: string,
  teamId: string,
  fetcher?: Fetch,
) => Promise<T[]>;

/**
 * A list for the Send to ClickUp window (its channels, or its people), read
 * with the actor's own token. Reads count against a per-member brake (60 in
 * 10 minutes); `what` names the list in a logged failure.
 */
export async function loadClickUpList<T>(
  db: Database,
  actor: ClickUpActor,
  { what, read }: { what: string; read: ClickUpListRead<T> },
  now: number,
  { apiUrl, fetcher, secret }: ClickUpServices,
): Promise<{ ok: true; items: T[] } | ClickUpRefused> {
  const connection = await connectionOf(db, actor, secret);
  if ("ok" in connection) return connection;
  const claim = reads(actor.userId, now);
  if (!claim.ok) return { ...claim, reason: "rate-limited" };
  try {
    return { ok: true, items: await read(apiUrl, connection.token, connection.teamId, fetcher) };
  } catch (error) {
    return refusalOf(error, `${what} read`);
  }
}

export type ClickUpSendOutcome =
  | { ok: true; url: string | null }
  | ClickUpRefused
  /** No such project in the workspace (or it's in the trash). */
  | { ok: false; reason: "not-found" }
  /** Archived: its review is closed, so it isn't sent anywhere. */
  | { ok: false; reason: "archived" }
  /** ClickUp doesn't know the channel (deleted, or the member left it). */
  | { ok: false; reason: "channel-gone" }
  /** ClickUp won't let the member post in the channel (its 403 on posting). */
  | { ok: false; reason: "channel-forbidden" };

async function projectOf(db: Queryable, workspaceId: string, projectId: string) {
  const { rows } = await db.query<{ name: string; archived_at: Date | null }>(
    `SELECT name, archived_at FROM projects
     WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [workspaceId, projectId],
  );
  return rows[0] ?? null;
}

/**
 * What ClickUp refusing a post says of the channel, or null when it's about
 * something else: a 404 is a channel it doesn't know, a 403 one the member
 * can't post in (their token still works; a 401 is the token itself).
 */
function channelRefusal(error: unknown): "channel-gone" | "channel-forbidden" | null {
  if (!(error instanceof ClickUpError)) return null;
  if (error.status === 404) return "channel-gone";
  if (error.status === 403) return "channel-forbidden";
  return null;
}

/** The project's page, absolute, on the site's own origin (never the request's host). */
export function projectUrl(projectId: string): string {
  return new URL(projectHref(projectId), authOrigin()).href;
}

/**
 * Posts project `projectId` to a ClickUp channel as the actor: its name and
 * its page's address, their note, and who it's assigned to.
 * At most 20 sends per member in 10 minutes. Audits each send
 * (`project.clickup_sent`: the channel and counts only).
 */
export async function sendProjectToClickUp(
  db: Database,
  actor: ClickUpActor,
  projectId: string,
  input: ClickUpSendInput,
  now: number,
  { apiUrl, fetcher, secret }: ClickUpServices,
): Promise<ClickUpSendOutcome> {
  const project = await projectOf(db, actor.workspaceId, projectId);
  if (!project) return { ok: false, reason: "not-found" };
  if (project.archived_at) return { ok: false, reason: "archived" };
  const connection = await connectionOf(db, actor, secret);
  if ("ok" in connection) return connection;
  const claim = sends(actor.userId, now);
  if (!claim.ok) return { ...claim, reason: "rate-limited" };
  const { channelId, note, assignee } = input;
  const content = clickUpMessage({
    projectName: project.name,
    projectUrl: projectUrl(projectId),
    note,
  });
  let posted;
  try {
    posted = await postClickUpMessage(
      apiUrl,
      connection.token,
      { teamId: connection.teamId, channelId },
      { content, ...(assignee ? { assignee } : {}) },
      fetcher,
    );
  } catch (error) {
    const refused = channelRefusal(error);
    return refused ? { ok: false, reason: refused } : refusalOf(error, "send");
  }
  await audit(
    db,
    {
      actorUserId: actor.userId,
      workspaceId: actor.workspaceId,
      action: "project.clickup_sent",
      target: { type: "project", id: projectId },
      fields: ["clickup"],
      meta: {
        clickUpTeamId: connection.teamId,
        channelId,
        assigned: assignee ? 1 : 0,
      },
    },
    now,
  );
  return { ok: true, url: posted.url };
}
