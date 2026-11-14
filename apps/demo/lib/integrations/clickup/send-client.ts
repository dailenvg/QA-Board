/**
 * The browser side of Send to ClickUp: the member's channels and ClickUp
 * people, and sending a project. Never throws: a network failure is an
 * outcome too. The token never reaches the browser; these routes use it.
 */

import { call, jsonInit, type ApiResult } from "../../share-client/api";
import type { ClickUpPerson } from "./api";
import type { ClickUpChannel } from "./chat-api";

export type ClickUpSendError =
  /** They haven't connected their own ClickUp in this workspace. */
  | "not-connected"
  /** ClickUp refused their token: they connect again. */
  | "reconnect"
  /** The channel picked is gone from ClickUp. */
  | "channel-gone"
  /** ClickUp won't let them post in the channel picked. */
  | "channel-forbidden"
  /** The project was archived (or deleted) meanwhile. */
  | "archived"
  | "not-found"
  | "rate-limited"
  /** ClickUp didn't answer. */
  | "unreachable"
  /** This site can't reach ClickUp. */
  | "unavailable"
  | "signed-out"
  | "offline"
  | "failed";

export type ClickUpRefused = { ok: false; error: ClickUpSendError; retryAfterSeconds?: number };

export type ClickUpListResult<T> = { ok: true; items: T[] } | ClickUpRefused;

const KNOWN: readonly ClickUpSendError[] = [
  "not-connected",
  "reconnect",
  "channel-gone",
  "channel-forbidden",
  "archived",
  "rate-limited",
  "unreachable",
  "unavailable",
];

/** A 429 that somehow came without when to retry: a minute. */
const DEFAULT_RETRY_SECONDS = 60;

/** What a refused call means, from its status and the route's `error`. */
export function clickUpRefusal(answer: Extract<ApiResult<unknown>, { ok: false }>): ClickUpRefused {
  if (answer.status === 0) return { ok: false, error: "offline" };
  if (answer.status === 401) return { ok: false, error: "signed-out" };
  if (answer.status === 429) {
    const retry = (answer.body as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
    return {
      ok: false,
      error: "rate-limited",
      retryAfterSeconds: typeof retry === "number" && retry > 0 ? retry : DEFAULT_RETRY_SECONDS,
    };
  }
  const known = KNOWN.find((error) => error === answer.error);
  if (known) return { ok: false, error: known };
  return { ok: false, error: answer.status === 404 ? "not-found" : "failed" };
}

const base = (workspaceId: string) => `/api/w/${encodeURIComponent(workspaceId)}`;

async function list<T>(
  workspaceId: string,
  kind: "channels" | "people",
): Promise<ClickUpListResult<T>> {
  const answer = await call<Partial<Record<typeof kind, T[]>>>(
    `${base(workspaceId)}/clickup/${kind}`,
  );
  if (!answer.ok) return clickUpRefusal(answer);
  const items = answer.value?.[kind];
  return Array.isArray(items) ? { ok: true, items } : { ok: false, error: "failed" };
}

/** The member's ClickUp channels, by name. */
export function loadClickUpChannels(
  workspaceId: string,
): Promise<ClickUpListResult<ClickUpChannel>> {
  return list<ClickUpChannel>(workspaceId, "channels");
}

/** The people in the member's ClickUp workspace, by name. */
export function loadClickUpPeople(workspaceId: string): Promise<ClickUpListResult<ClickUpPerson>> {
  return list<ClickUpPerson>(workspaceId, "people");
}

export interface ClickUpSendRequest {
  channelId: string;
  note: string;
  assignee: string | null;
}

/** Sends the project to a ClickUp channel; `url` is the message's link, when ClickUp gave one. */
export async function sendToClickUp(
  workspaceId: string,
  projectId: string,
  request: ClickUpSendRequest,
): Promise<{ ok: true; url: string | null } | ClickUpRefused> {
  const answer = await call<{ url?: unknown }>(
    `${base(workspaceId)}/projects/${encodeURIComponent(projectId)}/clickup`,
    jsonInit("POST", request),
  );
  if (!answer.ok) return clickUpRefusal(answer);
  const url = answer.value?.url;
  return { ok: true, url: typeof url === "string" ? url : null };
}
